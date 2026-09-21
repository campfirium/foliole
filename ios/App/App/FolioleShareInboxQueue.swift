import Foundation

struct FolioleShareInboxPart: Codable {
    let kind: String
    let value: String
}

struct FolioleShareInboxItem: Codable {
    let deliveryID: String
    let parts: [FolioleShareInboxPart]
    let receivedAt: String

    enum CodingKeys: String, CodingKey {
        case deliveryID = "delivery_id"
        case parts
        case receivedAt = "received_at"
    }
}

enum FolioleShareInboxQueue {
    static let appGroupIdentifier = "group.com.foliole.ios.share"
    private static let fileName = "foliole-share-inbox.json"

    static func load() throws -> [FolioleShareInboxItem] {
        let directory = try queueDirectory()
        var coordinationError: NSError?
        var result: Result<[FolioleShareInboxItem], Error>?
        NSFileCoordinator().coordinate(readingItemAt: directory, options: [], error: &coordinationError) { coordinatedDirectory in
            result = Result { try loadItems(from: coordinatedDirectory.appendingPathComponent(fileName)) }
        }
        if let coordinationError { throw coordinationError }
        return try result?.get() ?? []
    }

    static func stage(parts: [FolioleShareInboxPart]) throws {
        guard parts.contains(where: { !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else { return }
        try mutate { items in
            items.append(FolioleShareInboxItem(
                deliveryID: UUID().uuidString.lowercased(),
                parts: parts,
                receivedAt: ISO8601DateFormatter().string(from: Date())
            ))
        }
    }

    static func acknowledge(deliveryID: String) throws {
        try mutate { items in items.removeAll { $0.deliveryID == deliveryID } }
    }

    private static func queueDirectory() throws -> URL {
        guard let directory = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) else { throw NSError(domain: "FolioleShareInbox", code: 1) }
        return directory
    }

    private static func mutate(_ change: (inout [FolioleShareInboxItem]) throws -> Void) throws {
        let directory = try queueDirectory()
        var coordinationError: NSError?
        var mutationError: Error?
        NSFileCoordinator().coordinate(writingItemAt: directory, options: .forMerging, error: &coordinationError) { coordinatedDirectory in
            do {
                let target = coordinatedDirectory.appendingPathComponent(fileName)
                var items = try loadItems(from: target)
                try change(&items)
                try JSONEncoder().encode(items).write(
                    to: target,
                    options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
                )
                try FileManager.default.setAttributes([
                    .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
                ], ofItemAtPath: target.path)
            } catch { mutationError = error }
        }
        if let coordinationError { throw coordinationError }
        if let mutationError { throw mutationError }
    }

    private static func loadItems(from url: URL) throws -> [FolioleShareInboxItem] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        return try JSONDecoder().decode([FolioleShareInboxItem].self, from: Data(contentsOf: url))
    }
}
