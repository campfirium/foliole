// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FolioleIOSHostTests",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/weichsel/ZIPFoundation.git", exact: "0.9.20")
    ],
    targets: [
        .target(
            name: "FolioleSyncPackValidator",
            dependencies: [.product(name: "ZIPFoundation", package: "ZIPFoundation")],
            path: "App",
            exclude: [
                "AppDelegate.swift", "Assets.xcassets", "Base.lproj", "FolioleBridgeViewController.swift",
                "FolioleCompanionBonjourDiscovery.swift", "FolioleCompanionBootstrapPlugin.swift",
                "FolioleCompanionAttachmentSyncPlugin.swift",
                "FolioleCompanionContentBlobPack.swift", "FolioleCompanionQueryDefinitions.swift",
                "FolioleCompanionSyncPackTransfer.swift", "FolioleCompanionSyncPackTransferPlugin.swift",
                "Info.plist", "PrivacyInfo.xcprivacy", "capacitor.config.json",
                "FolioleCompanionSyncPlugin.swift",
                "config.xml", "public"
            ],
            sources: [
                "FolioleCompanionAttachmentFileStage.swift",
                "FolioleCompanionAttachmentResourceDownload.swift",
                "FolioleCompanionContractStore.swift",
                "FolioleCompanionDesktopHttpClient.swift",
                "FolioleCompanionZlib.swift",
                "FolioleCompanionSyncPackEnvelopeValidator.swift",
                "FolioleReadOnlySQLite.swift",
                "FolioleCompanionSyncPackDatabaseValidator.swift",
                "FolioleCompanionPairingSecretStore.swift",
                "FolioleCompanionPairingStore.swift"
            ],
            resources: [
                .copy("companion-bridge-contract-definitions.json"),
                .copy("companion-sync-group-bridge-contract-definitions.json"),
                .copy("companion-mutation-definitions.json"),
                .copy("companion-query-definitions.json"),
                .copy("companion-sync-protocol-definitions.json")
            ]
        ),
        .testTarget(
            name: "FolioleSyncPackValidatorTests",
            dependencies: [
                "FolioleSyncPackValidator",
                .product(name: "ZIPFoundation", package: "ZIPFoundation")
            ],
            path: "SyncPackValidatorTests"
        )
    ]
)
