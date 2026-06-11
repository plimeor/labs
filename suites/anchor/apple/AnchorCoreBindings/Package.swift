// swift-tools-version: 6.0

import Foundation
import PackageDescription

let ffiLibraryDirectory =
    ProcessInfo.processInfo.environment["ANCHOR_CORE_FFI_LIB_DIR"]
    ?? "../ffi/target/release"

let package = Package(
    name: "AnchorCoreBindings",
    platforms: [
        .macOS(.v14),
        .iOS(.v17)
    ],
    products: [
        .library(name: "AnchorCoreBindings", targets: ["AnchorCoreBindings"])
    ],
    targets: [
        .target(
            name: "AnchorCoreC",
            linkerSettings: [
                .unsafeFlags(
                    ["-L", ffiLibraryDirectory, "-lanchor_core_ffi"],
                    .when(platforms: [.macOS])
                )
            ]
        ),
        .target(
            name: "AnchorCoreBindings",
            dependencies: ["AnchorCoreC"]
        ),
        .testTarget(
            name: "AnchorCoreBindingsTests",
            dependencies: ["AnchorCoreBindings"]
        )
    ]
)
