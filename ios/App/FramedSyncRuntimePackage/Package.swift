// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FolioleFramedSyncRuntimePackage",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "FolioleFramedSyncRuntime", targets: ["FolioleFramedSyncRuntime"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-protobuf.git", exact: "1.38.1")
    ],
    targets: [
        .target(
            name: "FolioleFramedSyncRuntime",
            dependencies: [.product(name: "SwiftProtobuf", package: "swift-protobuf")],
            plugins: [
                .plugin(name: "FolioleFramedSyncGenerator")
            ]
        ),
        .plugin(
            name: "FolioleFramedSyncGenerator",
            capability: .buildTool(),
            dependencies: [
                .product(name: "protoc", package: "swift-protobuf"),
                .product(name: "protoc-gen-swift", package: "swift-protobuf")
            ]
        )
    ]
)
