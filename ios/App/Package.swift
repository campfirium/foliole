// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FolioleIOSHostTests",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(path: "FramedSyncRuntimePackage"),
        .package(url: "https://github.com/apple/swift-protobuf.git", exact: "1.38.1"),
        .package(url: "https://github.com/weichsel/ZIPFoundation.git", exact: "0.9.20")
    ],
    targets: [
        .target(
            name: "FolioleSyncPackValidator",
            dependencies: [
                .product(name: "FolioleFramedSyncRuntime", package: "FramedSyncRuntimePackage"),
                .product(name: "ZIPFoundation", package: "ZIPFoundation")
            ],
            path: "App",
            exclude: [
                "AppDelegate.swift", "Assets.xcassets", "Base.lproj", "FolioleBridgeViewController.swift",
                "FolioleCompanionBonjourDiscovery.swift", "FolioleCompanionBootstrapPlugin.swift",
                "FolioleCompanionAttachmentSyncPlugin.swift",
                "FolioleCompanionContentBlobPack.swift", "FolioleCompanionQueryDefinitions.swift",
                "FolioleCompanionSyncPackTransfer.swift", "FolioleCompanionSyncPackTransferPlugin.swift",
                "Info.plist", "PrivacyInfo.xcprivacy", "capacitor.config.json",
                "FolioleCompanionSyncPlugin.swift", "FolioleCompanionSyncGroupProviderPlugin.swift",
                "FolioleCompanionFramedSyncOutbound.swift",
                "FolioleCompanionSyncIdentityClientPlugin.swift",
                "FolioleCompanionSyncGroupDataBridge.swift", "FolioleCompanionSyncGroupSigning.swift",
                "FolioleCompanionSyncParticipation.swift", "FolioleCompanionSyncTrigger.swift",
                "config.xml", "public"
            ],
            sources: [
                "FolioleCompanionCanonicalAttachmentKey.swift",
                "FolioleCompanionFramedSyncTransferRoute.swift",
                "FolioleCompanionResourceAvailability.swift",
                "FolioleCompanionResourceTransferValidation.swift",
                "FolioleCompanionAttachmentFileStage.swift",
                "FolioleCompanionAttachmentResourceDownload.swift",
                "FolioleCompanionAttachmentCheckpoint.swift",
                "FolioleCompanionAttachmentResourceSessions.swift",
                "FolioleCompanionBonjourEndpoint.swift",
                "FolioleCompanionContractStore.swift",
                "FolioleCompanionDesktopHttpClient.swift",
                "FolioleFramedSyncHTTPReceiver.swift",
                "FolioleFramedSyncHTTPTransport.swift",
                "FolioleFramedSyncOutboundStaging.swift",
                "FolioleFramedSyncReceiptReader.swift",
                "FolioleFramedSyncSQLiteStaging.swift",
                "FolioleFramedSyncCanonicalManifest.swift",
                "FolioleFramedSyncReceiptWriter.swift",
                "FolioleFramedSyncTransferContext.swift",
                "FolioleFramedSyncTransferDatabase.swift",
                "FolioleFramedSyncTransferReceiver.swift",
                "FolioleFramedSyncTransferWriter.swift",
                "FolioleCompanionDeviceAnchorStore.swift",
                "FolioleCompanionHttpMessage.swift",
                "FolioleCompanionSyncGroupJoinCrypto.swift",
                "FolioleCompanionSyncGroupAdvertisement.swift",
                "FolioleCompanionSyncGroupDiscoveryPayload.swift",
                "FolioleCompanionSyncGroupJoinProvider.swift",
                "FolioleCompanionSyncGroupJoinRequest.swift",
                "FolioleCompanionSyncGroupJoinServer.swift",
                "FolioleCompanionSyncGroupRequestRoutes.swift",
                "FolioleCompanionSyncIdentityRoutes.swift",
                "FolioleCompanionSyncIdentityPackBuilder.swift",
                "FolioleCompanionIdentityPageContract.swift",
                "FolioleCompanionIdentityFactChunkWriter.swift",
                "FolioleCompanionSyncIdentityPushRoute.swift",
                "FolioleCompanionSyncIdentityClientView.swift",
                "FolioleCompanionSyncPackReceivedArchive.swift",
                "FolioleCompanionSyncGroupMemberStateEndpoint.swift",
                "FolioleCompanionSyncGroupResources.swift",
                "FolioleCompanionSyncGroupSnapshot.swift",
                "FolioleCompanionSyncGroupWorkgroup.swift",
                "FolioleCompanionWorkgroupClient.swift",
                "FolioleCompanionZlib.swift",
                "FolioleCompanionSyncPackArchive.swift",
                "FolioleCompanionSyncPackEnvelopeValidator.swift",
                "FolioleCompanionSyncPackFactIndex.swift",
                "FolioleCompanionSyncPackFactProvider.swift",
                "FolioleCompanionSyncPackPayloadWriter.swift",
                "FolioleCompanionSyncPackProvider.swift",
                "FolioleCompanionSyncPackProviderDefinitions.swift",
                "FolioleCompanionSyncPackSQLite.swift",
                "FolioleReadOnlySQLite.swift",
                "FolioleCompanionSyncPackDatabaseValidator.swift"
            ],
            resources: [
                .copy("companion-bridge-contract-definitions.json"),
                .copy("companion-mutation-definitions.json"),
                .copy("companion-query-definitions.json"),
                .copy("companion-sync-pack-provider-definitions.json"),
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
                .product(name: "ZIPFoundation", package: "ZIPFoundation")
            ],
            path: "SyncPackValidatorTests",
            exclude: [
                "FramedSync/framed_sync.proto",
                "FramedSync/swift-protobuf-config.json"
            ]
        )
    ]
)
