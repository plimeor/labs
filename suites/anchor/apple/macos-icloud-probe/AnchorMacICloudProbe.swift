import AppKit
import Foundation
import UniformTypeIdentifiers

private let containerIdentifier = "<ICLOUD_CONTAINER>"

private func emit(_ line: String) {
    print(line)
    fputs("\(line)\n", stderr)
    fflush(stdout)
    fflush(stderr)
}

private final class MetadataQueryRunner: NSObject {
    private var didFinishInitialGather = false

    func run(scope: URL, seconds: TimeInterval) -> (count: Int, names: [String], gathered: Bool) {
        let query = NSMetadataQuery()
        query.searchScopes = [scope]
        query.predicate = NSPredicate(format: "%K ENDSWITH %@", NSMetadataItemFSNameKey, ".seg")

        let token = NotificationCenter.default.addObserver(
            forName: .NSMetadataQueryDidFinishGathering,
            object: query,
            queue: .main
        ) { _ in
            self.didFinishInitialGather = true
        }
        defer {
            NotificationCenter.default.removeObserver(token)
            query.stop()
        }

        guard query.start() else {
            return (0, [], false)
        }

        let deadline = Date().addingTimeInterval(seconds)
        while !didFinishInitialGather && Date() < deadline {
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

        query.disableUpdates()
        defer { query.enableUpdates() }

        var names: [String] = []
        for index in 0..<query.resultCount {
            guard let item = query.result(at: index) as? NSMetadataItem else {
                continue
            }
            if let name = item.value(forAttribute: NSMetadataItemFSNameKey) as? String {
                names.append(name)
            }
        }
        names.sort()
        return (query.resultCount, Array(names.prefix(10)), didFinishInitialGather)
    }
}

private func coordinatedWrite(_ data: Data, to url: URL) throws {
    let coordinator = NSFileCoordinator(filePresenter: nil)
    var coordinationError: NSError?
    var writeError: Error?
    coordinator.coordinate(writingItemAt: url, options: [], error: &coordinationError) { coordinatedURL in
        do {
            try data.write(to: coordinatedURL, options: .atomic)
        } catch {
            writeError = error
        }
    }
    if let coordinationError {
        throw coordinationError
    }
    if let writeError {
        throw writeError
    }
}

private func coordinatedRead(from url: URL) throws -> Data {
    let coordinator = NSFileCoordinator(filePresenter: nil)
    var coordinationError: NSError?
    var readResult: Result<Data, Error> = .failure(NSError(domain: "AnchorMacICloudProbe", code: 1))
    coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) { coordinatedURL in
        readResult = Result { try Data(contentsOf: coordinatedURL) }
    }
    if let coordinationError {
        throw coordinationError
    }
    return try readResult.get()
}

private func resourceStatus(_ url: URL) -> (isUbiquitous: Bool, downloadStatus: String, typeIdentifier: String) {
    do {
        let values = try url.resourceValues(forKeys: [
            .isUbiquitousItemKey,
            .ubiquitousItemDownloadingStatusKey,
            .typeIdentifierKey
        ])
        return (
            values.isUbiquitousItem == true,
            values.ubiquitousItemDownloadingStatus?.rawValue ?? "nil",
            values.typeIdentifier ?? "nil"
        )
    } catch {
        return (false, "error:\((error as NSError).code)", "error:\((error as NSError).code)")
    }
}

private func runProbe() throws {
    let fileManager = FileManager.default
    let explicit = fileManager.url(forUbiquityContainerIdentifier: containerIdentifier)
    let implicit = fileManager.url(forUbiquityContainerIdentifier: nil)
    emit("macos-icloud:explicit_nil=\(explicit == nil)")
    emit("macos-icloud:implicit_nil=\(implicit == nil)")

    guard let containerURL = explicit else {
        emit("macos-icloud:blocked=no_ubiquity_container")
        return
    }

    emit("macos-icloud:explicit_path=\(containerURL.path)")
    if let implicit {
        emit("macos-icloud:implicit_path=\(implicit.path)")
    }

    let documentsURL = containerURL.appendingPathComponent("Documents", isDirectory: true)
    try fileManager.createDirectory(at: documentsURL, withIntermediateDirectories: true)

    let vaultURL = documentsURL.appendingPathComponent("AnchorStage1MacProbe.anchorvault", isDirectory: true)
    if fileManager.fileExists(atPath: vaultURL.path) {
        try fileManager.removeItem(at: vaultURL)
    }
    try fileManager.createDirectory(at: vaultURL, withIntermediateDirectories: true)
    let vaultType = UTType(filenameExtension: "anchorvault")?.identifier ?? "nil"
    emit("macos-icloud:vault_package=\(vaultURL.lastPathComponent)")
    emit("macos-icloud:vault_uttype_lookup=\(vaultType)")

    let operationsURL = vaultURL
        .appendingPathComponent(".anchor", isDirectory: true)
        .appendingPathComponent("operations", isDirectory: true)
        .appendingPathComponent("device_mac", isDirectory: true)
    try fileManager.createDirectory(at: operationsURL, withIntermediateDirectories: true)

    let segmentURL = operationsURL.appendingPathComponent("000001.seg")
    let segmentBytes = Data("anchor-stage1-macos-segment-000001".utf8)
    try coordinatedWrite(segmentBytes, to: segmentURL)
    let readBytes = try coordinatedRead(from: segmentURL)
    emit("macos-icloud:coordinated_segment_bytes=\(readBytes.count)")
    emit("macos-icloud:coordinated_segment_equal=\(readBytes == segmentBytes)")

    let status = resourceStatus(segmentURL)
    emit("macos-icloud:segment_is_ubiquitous=\(status.isUbiquitous)")
    emit("macos-icloud:segment_download_status=\(status.downloadStatus)")
    emit("macos-icloud:segment_type_identifier=\(status.typeIdentifier)")

    do {
        try fileManager.startDownloadingUbiquitousItem(at: segmentURL)
        emit("macos-icloud:start_download=ok")
    } catch {
        let nsError = error as NSError
        emit("macos-icloud:start_download_error=\(nsError.domain):\(nsError.code)")
    }

    let manifestURL = vaultURL.appendingPathComponent("manifest.json")
    try coordinatedWrite(Data("{\"device\":\"mac\",\"seq\":1}".utf8), to: manifestURL)
    try coordinatedWrite(Data("{\"device\":\"mac\",\"seq\":2}".utf8), to: manifestURL)
    let conflicts = NSFileVersion.unresolvedConflictVersionsOfItem(at: manifestURL) ?? []
    emit("macos-icloud:manifest_conflict_versions=\(conflicts.count)")

    let initialQuery = MetadataQueryRunner().run(scope: containerURL, seconds: 8)
    emit("macos-icloud:metadata_initial_gathered=\(initialQuery.gathered)")
    emit("macos-icloud:metadata_seg_count=\(initialQuery.count)")
    emit("macos-icloud:metadata_seg_names=\(initialQuery.names.joined(separator: ","))")

    let scaleURL = operationsURL.appendingPathComponent("scale", isDirectory: true)
    try fileManager.createDirectory(at: scaleURL, withIntermediateDirectories: true)
    let start = Date()
    for index in 0..<1024 {
        let name = String(format: "%05d.seg", index)
        let url = scaleURL.appendingPathComponent(name)
        try coordinatedWrite(Data("segment-\(index)".utf8), to: url)
    }
    let writeMilliseconds = Date().timeIntervalSince(start) * 1000
    let scaleQuery = MetadataQueryRunner().run(scope: containerURL, seconds: 12)
    emit("macos-icloud:scale_subset_files=1024")
    emit("macos-icloud:scale_subset_write_ms=\(String(format: "%.2f", writeMilliseconds))")
    emit("macos-icloud:scale_metadata_gathered=\(scaleQuery.gathered)")
    emit("macos-icloud:scale_metadata_seg_count=\(scaleQuery.count)")

    try fileManager.removeItem(at: vaultURL)
    emit("macos-icloud:cleanup_removed=true")
}

do {
    try runProbe()
} catch {
    emit("macos-icloud:error=\(String(describing: error))")
    exit(1)
}
