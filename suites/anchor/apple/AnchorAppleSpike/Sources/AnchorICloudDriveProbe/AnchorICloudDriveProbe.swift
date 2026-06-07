import Foundation

#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

public enum ICloudDriveProbeError: Error, Equatable {
    case ubiquityContainerUnavailable
    case coordination(String)
    case readFailed(String)
    case writeFailed(String)
}

public struct ICloudDriveRuntimeState: Equatable {
    public let containerAvailable: Bool
    public let isUbiquitousItem: Bool
    public let hasUnresolvedConflicts: Bool
    public let conflictVersionCount: Int
}

public final class ICloudDriveAdapterProbe {
    private let fileManager: FileManager

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    public func ubiquityContainerURL(identifier: String? = nil) -> URL? {
        fileManager.url(forUbiquityContainerIdentifier: identifier)
    }

    public func makeMetadataQuery(containerURL: URL?) -> NSMetadataQuery {
        let query = NSMetadataQuery()
        if let containerURL {
            query.searchScopes = [containerURL]
        } else {
            query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
        }
        query.predicate = NSPredicate(format: "%K == %@", NSMetadataItemFSNameKey, "*.seg")
        return query
    }

    public func isUbiquitousItem(_ url: URL) -> Bool {
        do {
            let values = try url.resourceValues(forKeys: [.isUbiquitousItemKey])
            return values.isUbiquitousItem == true
        } catch {
            return false
        }
    }

    public func startDownloadingPlaceholder(at url: URL) throws {
        try fileManager.startDownloadingUbiquitousItem(at: url)
    }

    public func coordinatedRead(at url: URL) throws -> Data {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?
        var readResult: Result<Data, Error> = .failure(ICloudDriveProbeError.readFailed("not_run"))
        coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) { coordinatedURL in
            readResult = Result { try Data(contentsOf: coordinatedURL) }
        }
        if let coordinationError {
            throw ICloudDriveProbeError.coordination(coordinationError.localizedDescription)
        }
        return try readResult.get()
    }

    public func coordinatedWrite(_ bytes: Data, at url: URL) throws {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?
        var writeResult: Result<Void, Error> = .failure(ICloudDriveProbeError.writeFailed("not_run"))
        coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { coordinatedURL in
            writeResult = Result { try bytes.write(to: coordinatedURL, options: .atomic) }
        }
        if let coordinationError {
            throw ICloudDriveProbeError.coordination(coordinationError.localizedDescription)
        }
        try writeResult.get()
    }

    public func runtimeState(for url: URL, containerIdentifier: String? = nil) -> ICloudDriveRuntimeState {
        let conflicts = NSFileVersion.unresolvedConflictVersionsOfItem(at: url) ?? []
        return ICloudDriveRuntimeState(
            containerAvailable: ubiquityContainerURL(identifier: containerIdentifier) != nil,
            isUbiquitousItem: isUbiquitousItem(url),
            hasUnresolvedConflicts: !conflicts.isEmpty,
            conflictVersionCount: conflicts.count
        )
    }
}

public enum AnchorVaultPackageDeclaration {
    public static let exportedTypeIdentifier = "dev.plimeor.anchor.vault"
    public static let packageConformance = "com.apple.package"

    #if canImport(UniformTypeIdentifiers)
    public static var exportedUTType: UTType {
        UTType(exportedAs: exportedTypeIdentifier, conformingTo: .package)
    }
    #endif
}
