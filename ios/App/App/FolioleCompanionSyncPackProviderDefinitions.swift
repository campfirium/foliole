import Foundation

struct FolioleCompanionSyncPackProviderDefinitions {
    let value: [String: Any]

    static func load() throws -> Self {
        #if SWIFT_PACKAGE
        let bundle = Bundle.module
        #else
        let bundle = Bundle.main
        #endif
        guard let url = bundle.url(
            forResource: "companion-sync-pack-provider-definitions", withExtension: "json"
        ) else { throw invalid("sync_pack_provider_definitions_missing") }
        let decoded = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let value = decoded as? [String: Any] else { throw invalid("sync_pack_provider_definitions_invalid") }
        return Self(value: value)
    }

    var compression: String { string("compression") }
    var copyStatements: [String] { value["copyStatements"] as? [String] ?? [] }
    var databaseEntry: String { string("databaseEntry") }
    var format: String { string("format") }
    var formatVersion: Int { value["formatVersion"] as? Int ?? -1 }
    var packSchema: [String] { value["packSchema"] as? [String] ?? [] }
    var payloadCopyIndex: Int { value["payloadCopyIndex"] as? Int ?? -1 }
    var payloadPlans: [[String: Any]] { value["payloadPlans"] as? [[String: Any]] ?? [] }
    var preparedMemberDataPlane: [String: Any] { value["preparedMemberDataPlane"] as? [String: Any] ?? [:] }
    var schemaVersion: Int { value["schemaVersion"] as? Int ?? -1 }
    var stateCopyIndex: Int { value["stateCopyIndex"] as? Int ?? -1 }
    var tableNames: [String] { value["tableNames"] as? [String] ?? [] }

    func validate() throws {
        guard compression == "zlib", !copyStatements.isEmpty, !databaseEntry.isEmpty,
              formatVersion > 0, !packSchema.isEmpty, payloadCopyIndex >= 0,
              schemaVersion > 0, stateCopyIndex >= 0, !tableNames.isEmpty else {
            throw Self.invalid("sync_pack_provider_definitions_invalid")
        }
    }

    private func string(_ key: String) -> String { value[key] as? String ?? "" }
    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncPackProviderDefinitions", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
