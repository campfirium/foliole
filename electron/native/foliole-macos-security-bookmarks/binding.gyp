{
  "targets": [
    {
      "target_name": "foliole_macos_security_bookmarks",
      "sources": [
        "src/bookmarks.mm"
      ],
      "libraries": [
        "-framework Foundation"
      ],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "12.0"
      }
    }
  ]
}
