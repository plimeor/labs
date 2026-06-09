import Foundation
import UniformTypeIdentifiers

enum ICloudProbeCommand {
    case runtime(scaleSubset: Int)
    case scale(fileCount: Int)
    case conflictPolicy(runID: String)
    case conflictResolve(runID: String)
    case placeholder

    init?(arguments: [String]) {
        if arguments.contains("--icloud-runtime-probe") {
            self = .runtime(scaleSubset: 1024)
            return
        }

        if arguments.contains("--icloud-placeholder-probe") {
            self = .placeholder
            return
        }

        if let conflictIndex = arguments.firstIndex(of: "--icloud-conflict-policy-probe") {
            let conflictValueIndex = arguments.index(after: conflictIndex)
            guard arguments.indices.contains(conflictValueIndex) else {
                self = .conflictPolicy(runID: "offline-conflict-20260607T113449Z")
                return
            }
            self = .conflictPolicy(runID: arguments[conflictValueIndex])
            return
        }

        if let resolveIndex = arguments.firstIndex(of: "--icloud-conflict-resolve-probe") {
            let resolveValueIndex = arguments.index(after: resolveIndex)
            guard arguments.indices.contains(resolveValueIndex) else {
                self = .conflictResolve(runID: "offline-conflict-20260607T113449Z")
                return
            }
            self = .conflictResolve(runID: arguments[resolveValueIndex])
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
        case let .conflictPolicy(runID):
            try runConflictPolicyProbe(runID: runID)
        case let .conflictResolve(runID):
            try runConflictResolveProbe(runID: runID)
        case .placeholder:
            try runPlaceholderProbe()
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

    private static func runConflictPolicyProbe(runID: String) throws {
        let container = try resolvedContainer()
        let manifest = container
            .appendingPathComponent("Documents", isDirectory: true)
            .appendingPathComponent("AnchorConflictProbe", isDirectory: true)
            .appendingPathComponent(runID, isDirectory: true)
            .appendingPathComponent("manifest.json")

        print("icloud_conflict_policy run_id=\(runID)")
        print("icloud_conflict_policy manifest_path=\(manifest.path)")
        print("icloud_conflict_policy manifest_exists=\(FileManager.default.fileExists(atPath: manifest.path))")

        let current = try coordinatedRead(from: manifest)
        print("icloud_conflict_policy current_bytes=\(current.count)")
        print("icloud_conflict_policy current_text=\(oneLineText(current))")

        let versions = NSFileVersion.unresolvedConflictVersionsOfItem(at: manifest) ?? []
        print("icloud_conflict_policy conflict_versions=\(versions.count)")

        for (index, version) in versions.enumerated() {
            let data = try Data(contentsOf: version.url)
            let modified = version.modificationDate.map { String(format: "%.0f", $0.timeIntervalSince1970) } ?? "nil"
            print("icloud_conflict_policy conflict_\(index)_is_conflict=\(version.isConflict)")
            print("icloud_conflict_policy conflict_\(index)_modified_epoch=\(modified)")
            print("icloud_conflict_policy conflict_\(index)_bytes=\(data.count)")
            print("icloud_conflict_policy conflict_\(index)_text=\(oneLineText(data))")
        }

        let duplicateManifests = try duplicateManifestFiles(near: manifest)
        print("icloud_conflict_policy duplicate_manifest_files=\(duplicateManifests.count)")
        for (index, duplicate) in duplicateManifests.enumerated() {
            let data = try Data(contentsOf: duplicate)
            print("icloud_conflict_policy duplicate_\(index)_name=\(duplicate.lastPathComponent)")
            print("icloud_conflict_policy duplicate_\(index)_bytes=\(data.count)")
            print("icloud_conflict_policy duplicate_\(index)_text=\(oneLineText(data))")
        }

        if versions.isEmpty && duplicateManifests.isEmpty {
            print("icloud_conflict_policy adapter_status=ok_no_conflict")
        } else {
            print("icloud_conflict_policy adapter_status=blocked_manifest_conflict")
        }

        print("icloud_conflict_policy policy_surface_conflicts=true")
        print("icloud_conflict_policy policy_preserve_versions=true")
        print("icloud_conflict_policy policy_auto_resolve=false")
        print("icloud_conflict_policy resolution_executed=false")
    }

    private static func runConflictResolveProbe(runID: String) throws {
        let container = try resolvedContainer()
        let manifest = container
            .appendingPathComponent("Documents", isDirectory: true)
            .appendingPathComponent("AnchorConflictProbe", isDirectory: true)
            .appendingPathComponent(runID, isDirectory: true)
            .appendingPathComponent("manifest.json")
        let directory = manifest.deletingLastPathComponent()
        let archive = directory.appendingPathComponent(
            "resolved-archive-\(Int(Date().timeIntervalSince1970))",
            isDirectory: true
        )

        print("icloud_conflict_resolve run_id=\(runID)")
        print("icloud_conflict_resolve manifest_path=\(manifest.path)")
        print("icloud_conflict_resolve manifest_exists=\(FileManager.default.fileExists(atPath: manifest.path))")
        print("icloud_conflict_resolve resolution_choice=current")

        let current = try coordinatedRead(from: manifest)
        try FileManager.default.createDirectory(at: archive, withIntermediateDirectories: true)
        let currentArchive = archive.appendingPathComponent("current-manifest.json")
        try current.write(to: currentArchive, options: .atomic)
        print("icloud_conflict_resolve archive_path=\(archive.path)")
        print("icloud_conflict_resolve archived_current_bytes=\(current.count)")
        print("icloud_conflict_resolve archived_current_text=\(oneLineText(current))")

        let versions = NSFileVersion.unresolvedConflictVersionsOfItem(at: manifest) ?? []
        let duplicateManifests = try duplicateManifestFiles(near: manifest)
        print("icloud_conflict_resolve before_conflict_versions=\(versions.count)")
        print("icloud_conflict_resolve before_duplicate_manifest_files=\(duplicateManifests.count)")

        for (index, version) in versions.enumerated() {
            let data = try Data(contentsOf: version.url)
            let versionArchive = archive.appendingPathComponent("conflict-version-\(index).json")
            try data.write(to: versionArchive, options: .atomic)
            print("icloud_conflict_resolve archived_conflict_\(index)_bytes=\(data.count)")
            print("icloud_conflict_resolve archived_conflict_\(index)_text=\(oneLineText(data))")
            version.isResolved = true
        }

        do {
            try NSFileVersion.removeOtherVersionsOfItem(at: manifest)
            print("icloud_conflict_resolve remove_other_versions_error=nil")
        } catch {
            let nsError = error as NSError
            print("icloud_conflict_resolve remove_other_versions_error=\(nsError.domain):\(nsError.code)")
        }

        for (index, duplicate) in duplicateManifests.enumerated() {
            let data = try Data(contentsOf: duplicate)
            let duplicateArchive = archive.appendingPathComponent("duplicate-\(index)-\(duplicate.lastPathComponent)")
            try FileManager.default.moveItem(at: duplicate, to: duplicateArchive)
            print("icloud_conflict_resolve archived_duplicate_\(index)_name=\(duplicate.lastPathComponent)")
            print("icloud_conflict_resolve archived_duplicate_\(index)_bytes=\(data.count)")
            print("icloud_conflict_resolve archived_duplicate_\(index)_text=\(oneLineText(data))")
        }

        let afterVersions = NSFileVersion.unresolvedConflictVersionsOfItem(at: manifest) ?? []
        let afterDuplicates = try duplicateManifestFiles(near: manifest)
        let afterCurrent = try coordinatedRead(from: manifest)
        print("icloud_conflict_resolve after_conflict_versions=\(afterVersions.count)")
        print("icloud_conflict_resolve after_duplicate_manifest_files=\(afterDuplicates.count)")
        print("icloud_conflict_resolve after_current_bytes=\(afterCurrent.count)")
        print("icloud_conflict_resolve after_current_text=\(oneLineText(afterCurrent))")
        print("icloud_conflict_resolve archive_preserved=true")
        print("icloud_conflict_resolve resolution_executed=true")
        if afterVersions.isEmpty && afterDuplicates.isEmpty {
            print("icloud_conflict_resolve adapter_status=ok_resolved")
        } else {
            print("icloud_conflict_resolve adapter_status=blocked_manifest_conflict")
        }
    }

    private static func runPlaceholderProbe() throws {
        let container = try resolvedContainer()
        let documents = container.appendingPathComponent("Documents", isDirectory: true)
        try FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)

        let root = documents.appendingPathComponent("AnchorPlaceholderProbe", isDirectory: true)
        try resetDirectory(root)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        let external = root.appendingPathComponent("external.anchorseg")
        try coordinatedWrite(Data("external-placeholder-segment\n".utf8), to: external)
        print("icloud_placeholder external_path=\(external.path)")
        printDownloadState(label: "external_before", url: external)
        runDownloadCycle(label: "external", url: external)

        let vault = root.appendingPathComponent("Vault.anchorvault", isDirectory: true)
        let packageSegments = vault.appendingPathComponent("segments", isDirectory: true)
        try FileManager.default.createDirectory(at: packageSegments, withIntermediateDirectories: true)

        let packageSegment = packageSegments.appendingPathComponent("000001.anchorseg")
        try coordinatedWrite(Data("package-placeholder-segment\n".utf8), to: packageSegment)
        print("icloud_placeholder package_segment_path=\(packageSegment.path)")
        printDownloadState(label: "package_before", url: packageSegment)
        runDownloadCycle(label: "package", url: packageSegment)

        try FileManager.default.removeItem(at: root)
        print("icloud_placeholder cleanup_removed=\(!FileManager.default.fileExists(atPath: root.path))")
    }

    private static func printDownloadState(label: String, url: URL) {
        print("icloud_placeholder \(label)_exists=\(FileManager.default.fileExists(atPath: url.path))")
        print("icloud_placeholder \(label)_is_ubiquitous=\(resourceBool(url, key: .isUbiquitousItemKey) ?? false)")
        print("icloud_placeholder \(label)_download_status=\(resourceString(url, key: .ubiquitousItemDownloadingStatusKey) ?? "nil")")
    }

    private static func runDownloadCycle(label: String, url: URL) {
        do {
            try FileManager.default.evictUbiquitousItem(at: url)
            print("icloud_placeholder \(label)_evict_error=nil")
        } catch {
            let nsError = error as NSError
            print("icloud_placeholder \(label)_evict_error=\(nsError.domain):\(nsError.code)")
        }

        printDownloadState(label: "\(label)_after_evict", url: url)

        do {
            try FileManager.default.startDownloadingUbiquitousItem(at: url)
            print("icloud_placeholder \(label)_start_download_error=nil")
        } catch {
            let nsError = error as NSError
            print("icloud_placeholder \(label)_start_download_error=\(nsError.domain):\(nsError.code)")
        }

        printDownloadState(label: "\(label)_after_start", url: url)

        do {
            let data = try coordinatedRead(from: url)
            print("icloud_placeholder \(label)_read_after_start_bytes=\(data.count)")
        } catch {
            let nsError = error as NSError
            print("icloud_placeholder \(label)_read_after_start_error=\(nsError.domain):\(nsError.code)")
        }
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

    private static func oneLineText(_ data: Data) -> String {
        String(decoding: data, as: UTF8.self)
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }

    private static func duplicateManifestFiles(near manifest: URL) throws -> [URL] {
        let directory = manifest.deletingLastPathComponent()
        let contents = try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )
        return contents
            .filter { $0.lastPathComponent.hasPrefix("manifest ") && $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
}
