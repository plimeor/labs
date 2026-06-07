// swift-tools-version: 6.0

import Foundation
import PackageDescription

let ffiLibraryDirectory =
    ProcessInfo.processInfo.environment["ANCHOR_CORE_FFI_LIB_DIR"]
    ?? "../ffi/target/aarch64-apple-darwin/release"

let package = Package(
    name: "AnchorAppleSpike",
    platforms: [
        .macOS(.v14),
        .iOS(.v17)
    ],
    products: [
        .library(name: "AnchorCoreBindings", targets: ["AnchorCoreBindings"]),
        .library(name: "AnchorTextKitProbe", targets: ["AnchorTextKitProbe"]),
        .library(name: "AnchorICloudDriveProbe", targets: ["AnchorICloudDriveProbe"]),
        .executable(name: "AnchorAppleSmoke", targets: ["AnchorAppleSmoke"]),
        .executable(name: "AnchorTextKitSmoke", targets: ["AnchorTextKitSmoke"])
    ],
    targets: [
        .target(
            name: "AnchorCoreC",
            linkerSettings: [
                .unsafeFlags(["-L", ffiLibraryDirectory, "-lanchor_core_ffi"])
            ]
        ),
        .target(
            name: "AnchorCoreBindings",
            dependencies: ["AnchorCoreC"]
        ),
        .executableTarget(
            name: "AnchorAppleSmoke",
            dependencies: ["AnchorCoreBindings"]
        ),
        .target(name: "AnchorTextKitProbe"),
        .executableTarget(
            name: "AnchorTextKitSmoke",
            dependencies: ["AnchorTextKitProbe"]
        ),
        .target(name: "AnchorICloudDriveProbe")
    ]
)
