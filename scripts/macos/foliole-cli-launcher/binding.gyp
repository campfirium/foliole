{
  "targets": [
    {
      "target_name": "foliole_cli_launcher",
      "type": "executable",
      "mac_bundle": 1,
      "product_name": "foliole",
      "sources": [
        "FolioleCliLauncher.m"
      ],
      "libraries": [
        "-framework Foundation"
      ],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "CODE_SIGN_ENTITLEMENTS": "$(SRCROOT)/FolioleCli.entitlements",
        "CODE_SIGN_INJECT_BASE_ENTITLEMENTS": "NO",
        "CODE_SIGN_STYLE": "Automatic",
        "DEVELOPMENT_TEAM": "V589TQH334",
        "INFOPLIST_FILE": "FolioleCli-Info.plist",
        "INFOPLIST_KEY_CFBundleDisplayName": "Foliole CLI",
        "INFOPLIST_KEY_CFBundleIdentifier": "com.campfirium.foliole.cli",
        "MACOSX_DEPLOYMENT_TARGET": "12.0",
        "PRODUCT_BUNDLE_IDENTIFIER": "com.campfirium.foliole.cli",
        "SKIP_INSTALL": "YES"
      }
    }
  ]
}
