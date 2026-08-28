{
  "targets": [
    {
      "target_name": "foliole_desktop_dnssd",
      "sources": ["src/addon.cc"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='mac'", {
          "sources": ["src/macos_backend.cc"],
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "12.0"
          }
        }],
        ["OS=='win'", {
          "sources": ["src/windows_backend.cc", "src/windows_service_codec.cc"],
          "defines": ["UNICODE", "_UNICODE"],
          "libraries": ["dnsapi.lib", "ws2_32.lib"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++20", "/EHsc"]
            }
          }
        }]
      ]
    }
  ]
}
