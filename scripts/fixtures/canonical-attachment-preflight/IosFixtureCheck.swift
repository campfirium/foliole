import Foundation

struct Entry: Decodable {
    let expectedKind: String
    let canonicalExtension: String?
}

let extensions = [
    "application/pdf": ".pdf", "image/gif": ".gif", "image/jpeg": ".jpg",
    "image/png": ".png", "image/webp": ".webp"
]
let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let entries = try JSONDecoder().decode([Entry].self, from: data)
guard entries.count == 9 else { fatalError("Expected 9 fixture entries") }
for entry in entries {
    guard extensions[entry.expectedKind] == entry.canonicalExtension else {
        fatalError("iOS fixture mismatch for \(entry.expectedKind)")
    }
}
print("ios canonical attachment fixture: ok")
