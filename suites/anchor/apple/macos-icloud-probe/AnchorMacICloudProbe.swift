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

private func countFiles(at url: URL, suffix: String) -> Int {
    guard let enumerator = FileManager.default.enumerator(at: url, includingPropertiesForKeys: nil) else {
        return 0
    }
    var count = 0
    for case let fileURL as URL in enumerator where fileURL.lastPathComponent.hasSuffix(suffix) {
        count += 1
    }
    return count
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

private struct ScaleProbeConfig {
    let runID: String
    let count: Int
    let metadataSeconds: TimeInterval
    let cleanup: Bool

    static func parse(arguments: [String]) -> ScaleProbeConfig? {
        guard let flagIndex = arguments.firstIndex(of: "--icloud-scale-probe") else {
            return nil
        }
        let first = flagIndex + 1
        guard arguments.count > first + 1 else {
            emit("macos-icloud-scale:blocked=missing_arguments")
            return nil
        }
        guard let count = Int(arguments[first + 1]), count > 0 else {
            emit("macos-icloud-scale:blocked=bad_count")
            return nil
        }
        let metadataSeconds = arguments.count > first + 2
            ? (TimeInterval(arguments[first + 2]) ?? 20)
            : 20
        let cleanup = arguments.count > first + 3
            ? (arguments[first + 3] != "keep")
            : true
        return ScaleProbeConfig(
            runID: arguments[first],
            count: count,
            metadataSeconds: metadataSeconds,
            cleanup: cleanup
        )
    }
}

private func runScaleProbe(_ config: ScaleProbeConfig) throws {
    let fileManager = FileManager.default
    let explicit = fileManager.url(forUbiquityContainerIdentifier: containerIdentifier)
    emit("macos-icloud-scale:run_id=\(config.runID)")
    emit("macos-icloud-scale:count=\(config.count)")
    emit("macos-icloud-scale:explicit_nil=\(explicit == nil)")
    guard let containerURL = explicit else {
        emit("macos-icloud-scale:blocked=no_ubiquity_container")
        return
    }

    let documentsURL = containerURL.appendingPathComponent("Documents", isDirectory: true)
    try fileManager.createDirectory(at: documentsURL, withIntermediateDirectories: true)

    let vaultURL = documentsURL.appendingPathComponent("AnchorScaleProbe-\(config.runID).anchorvault", isDirectory: true)
    if fileManager.fileExists(atPath: vaultURL.path) {
        try fileManager.removeItem(at: vaultURL)
    }
    try fileManager.createDirectory(at: vaultURL, withIntermediateDirectories: true)
    let values = try vaultURL.resourceValues(forKeys: [.typeIdentifierKey, .isUbiquitousItemKey])
    emit("macos-icloud-scale:vault_package=\(vaultURL.lastPathComponent)")
    emit("macos-icloud-scale:vault_type_identifier=\(values.typeIdentifier ?? "nil")")
    emit("macos-icloud-scale:vault_is_ubiquitous=\(values.isUbiquitousItem == true)")

    let operationsURL = vaultURL
        .appendingPathComponent(".anchor", isDirectory: true)
        .appendingPathComponent("operations", isDirectory: true)
        .appendingPathComponent("device_mac", isDirectory: true)
        .appendingPathComponent("scale", isDirectory: true)
    try fileManager.createDirectory(at: operationsURL, withIntermediateDirectories: true)

    let writeStart = Date()
    let progressEvery = max(1, config.count / 10)
    for index in 0..<config.count {
        let name = String(format: "%05d.seg", index)
        let url = operationsURL.appendingPathComponent(name)
        try coordinatedWrite(Data("segment-\(index)".utf8), to: url)
        if (index + 1) % progressEvery == 0 || index + 1 == config.count {
            emit("macos-icloud-scale:write_progress=\(index + 1)")
        }
    }
    emit("macos-icloud-scale:write_ms=\(String(format: "%.2f", Date().timeIntervalSince(writeStart) * 1000))")

    let directStart = Date()
    let directCount = countFiles(at: operationsURL, suffix: ".seg")
    emit("macos-icloud-scale:direct_seg_count=\(directCount)")
    emit("macos-icloud-scale:direct_enumeration_ms=\(String(format: "%.2f", Date().timeIntervalSince(directStart) * 1000))")

    let metadataQuery = MetadataQueryRunner().run(scope: containerURL, seconds: config.metadataSeconds)
    emit("macos-icloud-scale:metadata_gathered=\(metadataQuery.gathered)")
    emit("macos-icloud-scale:metadata_seg_count=\(metadataQuery.count)")
    emit("macos-icloud-scale:metadata_seg_names=\(metadataQuery.names.joined(separator: ","))")

    if config.cleanup {
        let cleanupStart = Date()
        try fileManager.removeItem(at: vaultURL)
        emit("macos-icloud-scale:cleanup_removed=true")
        emit("macos-icloud-scale:cleanup_ms=\(String(format: "%.2f", Date().timeIntervalSince(cleanupStart) * 1000))")
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
    if let scaleConfig = ScaleProbeConfig.parse(arguments: CommandLine.arguments) {
        try runScaleProbe(scaleConfig)
    } else {
        try runProbe()
    }
} catch {
    emit("macos-icloud:error=\(String(describing: error))")
    exit(1)
}
