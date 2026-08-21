import Foundation

struct FolioleCompanionSyncPackContract {
    let compression: String
    let databaseEntry: String
    let format: String
    let formatVersion: Int
    let manifestTableNames: Set<String>
    let maximumSchemaVersion: Int
    let minimumSchemaVersion: Int
    let sqliteTableRequirements: [String: Set<String>]
}

struct FolioleCompanionPairingContract {
    let credentialRequestKeys: [String: String]
    let discoveryCandidateKeys: [String: String]
    let discoveryResponseKeys: [String: String]
    let networkRequestKeys: [String: String]
    let networkResponseKeys: [String: String]
    let legacyPreferenceKeys: [String: String]
    let preferenceKeys: [String: String]
    let signatureHeaderKeys: [String: String]
    let signatureRequestKeys: [String: String]
    let signatureResponseKeys: [String: String]
    let stateKeys: [String: String]
    let storageKeys: [String: String]
}

struct FolioleCompanionContentBlobContract {
    let batchResponseKeys: [String: String]
    let defaultLimit: Int
    let hashPattern: String
    let hashesReplacement: String
    let missingResultKeys: [String: String]
    let requestKeys: [String: String]
    let responseHeaderKey: String
    let sql: [String: String]
    let statuses: [String: String]
    let supportedCompression: String
}

struct FolioleCompanionAttachmentResourceContract {
    let batchResponseKeys: [String: String]
    let defaultLimit: Int
    let directoryName: String
    let hashPattern: String
    let idFilterReplacement: String
    let missingResultKeys: [String: String]
    let requestKeys: [String: String]
    let resolveResponseKeys: [String: String]
    let resolveStatuses: [String: String]
    let sql: [String: String]
    let statuses: [String: String]
}

final class FolioleCompanionContractStore {
    private let bridge: [String: Any]
    private let sync: [String: Any]

    init(bundle: Bundle = .main) throws {
        bridge = try Self.load("companion-bridge-contract-definitions", bundle: bundle)
        sync = try Self.load("companion-sync-protocol-definitions", bundle: bundle)
    }

    func transferRequestKey(_ key: String) throws -> String {
        try string(path: ["hostApi", "syncPackTransfer", "requestKeys", key], root: bridge)
    }

    func transferResponseKey(_ key: String) throws -> String {
        try string(path: ["hostApi", "syncPackTransfer", "responseKeys", key], root: bridge)
    }

    func syncPackContract() throws -> FolioleCompanionSyncPackContract {
        let value = try object(path: ["syncPackEnvelope"], root: sync)
        let requirements = try object(path: ["sqliteTableRequirements"], root: value)
        return FolioleCompanionSyncPackContract(
            compression: try string(path: ["compression"], root: value),
            databaseEntry: try string(path: ["databaseEntry"], root: value),
            format: try string(path: ["format"], root: value),
            formatVersion: try integer(path: ["formatVersion"], root: value),
            manifestTableNames: Set(try strings(path: ["manifestTableNames"], root: value)),
            maximumSchemaVersion: try integer(path: ["maximumSchemaVersion"], root: value),
            minimumSchemaVersion: try integer(path: ["minimumSchemaVersion"], root: value),
            sqliteTableRequirements: try requirements.reduce(into: [:]) { result, entry in
                guard let columns = entry.value as? [String] else { throw Self.contractError(entry.key) }
                result[entry.key] = Set(columns)
            }
        )
    }

    func pairingContract() throws -> FolioleCompanionPairingContract {
        FolioleCompanionPairingContract(
            credentialRequestKeys: try stringMap(path: ["pairingPlugin", "credentialRequestKeys"], root: bridge),
            discoveryCandidateKeys: try stringMap(path: ["hostApi", "network", "discoveryCandidateKeys"], root: bridge),
            discoveryResponseKeys: try stringMap(path: ["hostApi", "network", "discoveryResponseKeys"], root: bridge),
            networkRequestKeys: try stringMap(path: ["hostApi", "network", "requestKeys"], root: bridge),
            networkResponseKeys: try stringMap(path: ["hostApi", "network", "responseKeys"], root: bridge),
            legacyPreferenceKeys: try stringMap(path: ["pairingPlugin", "legacyPreferenceKeys"], root: bridge),
            preferenceKeys: try stringMap(path: ["pairingPlugin", "preferenceKeys"], root: bridge),
            signatureHeaderKeys: try stringMap(path: ["pairingPlugin", "signature", "headerKeys"], root: bridge),
            signatureRequestKeys: try stringMap(path: ["pairingPlugin", "signature", "requestKeys"], root: bridge),
            signatureResponseKeys: try stringMap(path: ["pairingPlugin", "signature", "responseKeys"], root: bridge),
            stateKeys: try stringMap(path: ["pairingPlugin", "stateKeys"], root: bridge),
            storageKeys: try stringMap(path: ["pairingPlugin", "storageKeys"], root: bridge)
        )
    }

    func contentBlobContract() throws -> FolioleCompanionContentBlobContract {
        let root = try object(path: ["hostApi", "contentBlobSync"], root: bridge)
        return FolioleCompanionContentBlobContract(
            batchResponseKeys: try stringMap(path: ["batchResponseKeys"], root: root),
            defaultLimit: try integer(path: ["defaultLimit"], root: root),
            hashPattern: try string(path: ["cas", "hashPattern"], root: root),
            hashesReplacement: try string(path: ["hashesReplacement"], root: root),
            missingResultKeys: try stringMap(path: ["missingResultKeys"], root: root),
            requestKeys: try stringMap(path: ["requestKeys"], root: root),
            responseHeaderKey: try string(path: ["responseHeaderKey"], root: root),
            sql: try stringMap(path: ["sql"], root: root),
            statuses: try stringMap(path: ["statuses"], root: root),
            supportedCompression: try string(path: ["cas", "supportedCompression"], root: root)
        )
    }

    func attachmentResourceContract() throws -> FolioleCompanionAttachmentResourceContract {
        let root = try object(path: ["hostApi", "attachmentResourceSync"], root: bridge)
        return FolioleCompanionAttachmentResourceContract(
            batchResponseKeys: try stringMap(path: ["batchResponseKeys"], root: root),
            defaultLimit: try integer(path: ["defaultLimit"], root: root),
            directoryName: try string(path: ["directoryName"], root: root),
            hashPattern: try string(path: ["hashPattern"], root: root),
            idFilterReplacement: try string(path: ["idFilterReplacement"], root: root),
            missingResultKeys: try stringMap(path: ["missingResultKeys"], root: root),
            requestKeys: try stringMap(path: ["requestKeys"], root: root),
            resolveResponseKeys: try stringMap(path: ["resolveResponseKeys"], root: root),
            resolveStatuses: try stringMap(path: ["resolveStatuses"], root: root),
            sql: try stringMap(path: ["sql"], root: root),
            statuses: try stringMap(path: ["statuses"], root: root)
        )
    }

    private static func load(_ name: String, bundle: Bundle) throws -> [String: Any] {
        guard let url = bundle.url(forResource: name, withExtension: "json") else {
            throw contractError("missing resource \(name)")
        }
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let object = value as? [String: Any] else { throw contractError(name) }
        return object
    }

    private func object(path: [String], root: [String: Any]) throws -> [String: Any] {
        guard let result = try value(path: path, root: root) as? [String: Any] else {
            throw Self.contractError(path.joined(separator: "."))
        }
        return result
    }

    private func string(path: [String], root: [String: Any]) throws -> String {
        guard let result = try value(path: path, root: root) as? String, !result.isEmpty else {
            throw Self.contractError(path.joined(separator: "."))
        }
        return result
    }

    private func strings(path: [String], root: [String: Any]) throws -> [String] {
        guard let result = try value(path: path, root: root) as? [String], Set(result).count == result.count else {
            throw Self.contractError(path.joined(separator: "."))
        }
        return result
    }

    private func stringMap(path: [String], root: [String: Any]) throws -> [String: String] {
        let value = try object(path: path, root: root)
        return try value.reduce(into: [:]) { result, entry in
            guard let string = entry.value as? String, !string.isEmpty else {
                throw Self.contractError(path.joined(separator: "."))
            }
            result[entry.key] = string
        }
    }

    private func integer(path: [String], root: [String: Any]) throws -> Int {
        guard let number = try value(path: path, root: root) as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue == Double(number.intValue) else {
            throw Self.contractError(path.joined(separator: "."))
        }
        return number.intValue
    }

    private func value(path: [String], root: [String: Any]) throws -> Any {
        var current: Any = root
        for key in path {
            guard let object = current as? [String: Any], let next = object[key] else {
                throw Self.contractError(path.joined(separator: "."))
            }
            current = next
        }
        return current
    }

    private static func contractError(_ detail: String) -> Error {
        NSError(domain: "FolioleCompanionContract", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid companion contract: \(detail)"])
    }
}
