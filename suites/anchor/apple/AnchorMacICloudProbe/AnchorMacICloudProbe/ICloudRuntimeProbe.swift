import Foundation
import UniformTypeIdentifiers

enum ICloudProbeCommand {
    case runtime(scaleSubset: Int)
    case scale(fileCount: Int)

    init?(arguments: [String]) {
        if arguments.contains("--icloud-runtime-probe") {
            self = .runtime(scaleSubset: 1024)
            return
        }

        guard let index = arguments.firstIndex(of: "--icloud-scale-probe") else {
            return nil
        }

        let valueIndex = arguments.index(after: index)
        guard arguments.indices.contains(valueIndex),
              let fileCount = Int(arguments[valueIndex]),
              fileCount > 0 else {
            self = .scale(fileCount: 10_000)
            return
        }

        self = .scale(fileCount: fileCount)
    }
}

enum ICloudRuntimeProbe {
    private static let containerIdentifier = "<ICLOUD_CONTAINER>"
    private static let vaultName = "AnchorStage1MacProbe.anchorvault"

    static func run(command: ICloudProbeCommand) throws {
        switch command {
        case let .runtime(scaleSubset):
            try runRuntimeProbe(scaleSubset: scaleSubset)
        case let .scale(fileCount):
            try runScaleProbe(fileCount: fileCount)
        }
    }

    private static func runRuntimeProbe(scaleSubset: Int) throws {
        let container = try resolvedContainer()
        print("icloud_probe container_path=\(container.path)")

        let vault = container.appendingPathComponent(vaultName, isDirectory: true)
        try resetDirectory(vault)
        try FileManager.default.createDirectory(at: vault, withIntermediateDirectories: true)

        let manifest = vault.appendingPathComponent("manifest.json")
        try Data("{\"stage\":\"1\",\"probe\":\"macos\"}\n".utf8).write(to: manifest, options: .atomic)

        let segments = vault.appendingPathComponent("segments", isDirectory: true)
        try FileManager.default.createDirectory(at: segments, withIntermediateDirectories: true)

        let segment = segments.appendingPathComponent("000001.anchorseg")
        let segmentBytes = Data("{\"segment\":1,\"body\":\"stage1\"}\n".utf8)
        try coordinatedWrite(segmentBytes, to: segment)
        let readBytes = try coordinatedRead(from: segment)

        print("icloud_probe vault_package=\(vault.lastPathComponent)")
        print("icloud_probe vault_uttype_lookup=\(UTType(filenameExtension: "anchorvault")?.identifier ?? "nil")")
        print("icloud_probe vault_type_identifier=\(resourceString(vault, key: .typeIdentifierKey) ?? "nil")")
        print("icloud_probe vault_is_ubiquitous=\(resourceBool(vault, key: .isUbiquitousItemKey) ?? false)")
        print("icloud_probe coordinated_segment_bytes=\(readBytes.count)")
        print("icloud_probe coordinated_segment_equal=\(readBytes == segmentBytes)")
        print("icloud_probe segment_is_ubiquitous=\(resourceBool(segment, key: .isUbiquitousItemKey) ?? false)")
        print("icloud_probe segment_download_status=\(resourceString(segment, key: .ubiquitousItemDownloadingStatusKey) ?? "nil")")
        print("icloud_probe segment_type_identifier=\(resourceString(segment, key: .typeIdentifierKey) ?? "nil")")

        runEvictionProbe(segment)

        let conflictCount = NSFileVersion.unresolvedConflictVersionsOfItem(at: manifest)?.count ?? 0
        print("icloud_probe manifest_conflict_versions=\(conflictCount)")

        let metadata = metadataCount(matchingExtension: "anchorseg", timeoutSeconds: 5)
        print("icloud_probe metadata_initial_gathered=\(metadata.gathered)")
        print("icloud_probe metadata_seg_count=\(metadata.count)")

        let scale = try writeScaleSubset(fileCount: scaleSubset, under: segments)
        print("icloud_probe scale_subset_files=\(scaleSubset)")
        print("icloud_probe scale_subset_write_ms=\(String(format: "%.2f", scale.writeMs))")
        print("icloud_probe scale_subset_direct_count=\(scale.directCount)")
        print("icloud_probe scale_subset_enum_ms=\(String(format: "%.2f", scale.enumMs))")

        try FileManager.default.removeItem(at: vault)
        print("icloud_probe cleanup_removed=\(!FileManager.default.fileExists(atPath: vault.path))")
    }

    private static func runScaleProbe(fileCount: Int) throws {
        let container = try resolvedContainer()
        let vault = container.appendingPathComponent("AnchorStage1MacScale-\(fileCount).anchorvault", isDirectory: true)
        try resetDirectory(vault)
        let segments = vault.appendingPathComponent("segments", isDirectory: true)
        try FileManager.default.createDirectory(at: segments, withIntermediateDirectories: true)

        let scale = try writeScaleSubset(fileCount: fileCount, under: segments)
        let metadata = metadataCount(matchingExtension: "anchorseg", timeoutSeconds: 5)

        let cleanupStart = DispatchTime.now()
        try FileManager.default.removeItem(at: vault)
        let cleanupMs = elapsedMs(from: cleanupStart)

        print("icloud_scale files=\(fileCount)")
        print("icloud_scale write_ms=\(String(format: "%.2f", scale.writeMs))")
        print("icloud_scale direct_count=\(scale.directCount)")
        print("icloud_scale enum_ms=\(String(format: "%.2f", scale.enumMs))")
        print("icloud_scale metadata_gathered=\(metadata.gathered)")
        print("icloud_scale metadata_count=\(metadata.count)")
        print("icloud_scale cleanup_ms=\(String(format: "%.2f", cleanupMs))")
    }

    private static func resolvedContainer() throws -> URL {
        let explicit = FileManager.default.url(forUbiquityContainerIdentifier: containerIdentifier)
        let implicit = FileManager.default.url(forUbiquityContainerIdentifier: nil)
        print("icloud_probe explicit_nil=\(explicit == nil)")
        print("icloud_probe implicit_nil=\(implicit == nil)")

        guard let explicit else {
            throw NSError(
                domain: "AnchorMacICloudProbe",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Missing explicit ubiquity container \(containerIdentifier)"]
            )
        }

        return explicit
    }

    private static func resetDirectory(_ url: URL) throws {
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    private static func coordinatedWrite(_ data: Data, to url: URL) throws {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var writeError: Error?

        coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &coordinatorError) { coordinatedURL in
            do {
                try data.write(to: coordinatedURL, options: .atomic)
            } catch {
                writeError = error
            }
        }

        if let coordinatorError {
            throw coordinatorError
        }

        if let writeError {
            throw writeError
        }
    }

    private static func coordinatedRead(from url: URL) throws -> Data {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var readError: Error?
        var data = Data()

        coordinator.coordinate(readingItemAt: url, options: [], error: &coordinatorError) { coordinatedURL in
            do {
                data = try Data(contentsOf: coordinatedURL)
            } catch {
                readError = error
            }
        }

        if let coordinatorError {
            throw coordinatorError
        }

        if let readError {
            throw readError
        }

        return data
    }

    private static func runEvictionProbe(_ url: URL) {
        do {
            try FileManager.default.evictUbiquitousItem(at: url)
            print("icloud_probe evict_segment_error=nil")
        } catch {
            print("icloud_probe evict_segment_error=\(error)")
        }

        print("icloud_probe after_evict_is_ubiquitous=\(resourceBool(url, key: .isUbiquitousItemKey) ?? false)")
        print("icloud_probe after_evict_download_status=\(resourceString(url, key: .ubiquitousItemDownloadingStatusKey) ?? "nil")")

        do {
            try FileManager.default.startDownloadingUbiquitousItem(at: url)
            print("icloud_probe start_download_error=nil")
        } catch {
            print("icloud_probe start_download_error=\(error)")
        }
    }

    private static func writeScaleSubset(fileCount: Int, under directory: URL) throws -> (writeMs: Double, directCount: Int, enumMs: Double) {
        let writeStart = DispatchTime.now()

        for index in 0..<fileCount {
            let fileName = String(format: "%06d.anchorseg", index)
            let file = directory.appendingPathComponent(fileName)
            try Data("segment-\(index)\n".utf8).write(to: file, options: .atomic)
        }

        let writeMs = elapsedMs(from: writeStart)
        let enumStart = DispatchTime.now()
        let directCount = (FileManager.default.enumerator(at: directory, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "anchorseg" }
            .count) ?? 0
        let enumMs = elapsedMs(from: enumStart)

        return (writeMs, directCount, enumMs)
    }

    private static func metadataCount(matchingExtension pathExtension: String, timeoutSeconds: TimeInterval) -> (gathered: Bool, count: Int) {
        let query = NSMetadataQuery()
        query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
        query.predicate = NSPredicate(format: "%K ENDSWITH %@", NSMetadataItemFSNameKey, ".\(pathExtension)")

        var gathered = false
        let token = NotificationCenter.default.addObserver(
            forName: NSNotification.Name.NSMetadataQueryDidFinishGathering,
            object: query,
            queue: nil
        ) { _ in
            gathered = true
        }

        query.start()
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while !gathered && Date() < deadline {
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }

        query.disableUpdates()
        let count = query.resultCount
        query.stop()
        NotificationCenter.default.removeObserver(token)

        return (gathered, count)
    }

    private static func resourceString(_ url: URL, key: URLResourceKey) -> String? {
        try? url.resourceValues(forKeys: [key]).allValues[key] as? String
    }

    private static func resourceBool(_ url: URL, key: URLResourceKey) -> Bool? {
        try? url.resourceValues(forKeys: [key]).allValues[key] as? Bool
    }

    private static func elapsedMs(from start: DispatchTime) -> Double {
        let end = DispatchTime.now()
        return Double(end.uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000
    }
}
