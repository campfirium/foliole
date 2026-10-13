// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FolioleIOSHostTests",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(path: "FramedSyncRuntimePackage"),
        .package(url: "https://github.com/apple/swift-protobuf.git", exact: "1.38.1"),
    ],
    targets: [
        .target(
            name: "FolioleSyncPackValidator",
            dependencies: [
                .product(name: "FolioleFramedSyncRuntime", package: "FramedSyncRuntimePackage"),
            ],
            path: "App",
            exclude: [
                "AppDelegate.swift", "Assets.xcassets", "Base.lproj", "FolioleBridgeViewController.swift",
                "FolioleCompanionBonjourDiscovery.swift", "FolioleCompanionBootstrapPlugin.swift",
                "FolioleCompanionAttachmentSyncPlugin.swift",
                "Info.plist", "PrivacyInfo.xcprivacy", "capacitor.config.json",
                "FolioleCompanionSyncPlugin.swift", "FolioleCompanionSyncGroupProviderPlugin.swift",
                "FolioleCompanionFramedSyncPayloadBudget.swift",
                "FolioleCompanionFramedSyncFiles.swift",
                "FolioleCompanionRequestSyncHTTP.swift",
                "FolioleFramedSyncWebViewLifecycle.swift",
                "FolioleCompanionSyncGroupSigning.swift",
                "FolioleCompanionSyncParticipation.swift", "FolioleCompanionSyncTrigger.swift",
                "config.xml", "public"
            ],
            sources: [
                "FolioleCompanionCanonicalAttachmentKey.swift",
                "FolioleCompanionResourceAvailability.swift",
                "FolioleCompanionAttachmentFileStage.swift",
                "FolioleCompanionAttachmentResourceDownload.swift",
                "FolioleCompanionAttachmentCheckpoint.swift",
                "FolioleCompanionAttachmentResourceSessions.swift",
                "FolioleCompanionBonjourEndpoint.swift",
                "FolioleCompanionContractStore.swift",
                "FolioleCompanionDesktopHttpClient.swift",
                "FolioleFramedSyncHTTPReceiver.swift",
                "FolioleRequestSyncHTTPChunks.swift",
                "FolioleRequestSyncRoute.swift",
                "FolioleFramedSyncHTTPTransport.swift",
                "FolioleFramedSyncFileResponse.swift",
                "FolioleFramedSyncFiles.swift",
                "FolioleFramedSyncReceiptReader.swift",
                "FolioleFramedSyncCanonicalManifest.swift",
                "FolioleFramedSyncTransferContext.swift",
                "FolioleFramedSyncPayloadBudget.swift",
                "FolioleFramedSyncPayloadBudgetRegistry.swift",
                "FolioleFramedSyncPayloadWorker.swift",
                "FolioleFramedSyncPayloadCancellation.swift",
                "FolioleFramedSyncDocumentOwner.swift",
                "FolioleFramedSyncOwnedBridge.swift",
                "FolioleCompanionSyncGroupDataBridge.swift",

                "FolioleCompanionDeviceAnchorStore.swift",
                "FolioleCompanionHttpMessage.swift",
                "FolioleCompanionHttpRequestReader.swift",
                "FolioleCompanionSyncGroupJoinCrypto.swift",
                "FolioleCompanionSyncGroupAdvertisement.swift",
                "FolioleCompanionSyncGroupDiscoveryPayload.swift",
                "FolioleCompanionSyncGroupJoinProvider.swift",
                "FolioleCompanionSyncGroupJoinRequest.swift",
                "FolioleCompanionSyncGroupJoinServer.swift",
                "FolioleCompanionSyncGroupRequestRoutes.swift",
                "FolioleCompanionSyncGroupMemberStateEndpoint.swift",
                "FolioleCompanionSyncGroupResources.swift",
                "FolioleCompanionSyncGroupWorkgroup.swift",
                "FolioleCompanionWorkgroupClient.swift",
                "FolioleReadOnlySQLite.swift",
            ],
            resources: [
                .copy("companion-bridge-contract-definitions.json"),
                .copy("companion-mutation-definitions.json"),
                .copy("companion-query-definitions.json"),
                .copy("companion-sync-protocol-definitions.json")
            ]
        ),
        .testTarget(
            name: "FolioleSyncPackValidatorTests",
            dependencies: [
                "FolioleSyncPackValidator",
                .product(
                    name: "FolioleFramedSyncRuntime",
                    package: "FramedSyncRuntimePackage"
                ),
                .product(name: "SwiftProtobuf", package: "swift-protobuf"),
            ],
            path: "SyncPackValidatorTests",
            exclude: [
                "FramedSync/framed_sync.proto",
                "FramedSync/swift-protobuf-config.json"
            ]
        )
    ]
)
