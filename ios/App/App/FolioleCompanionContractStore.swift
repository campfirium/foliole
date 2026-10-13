import Foundation

struct FolioleCompanionNetworkContract {
    let protocolCapabilities: [String]
    let protocolMaximumVersion: Int
    let protocolMinimumVersion: Int
    let protocolVersion: Int
    let discoveryCandidateKeys: [String: String]
    let discoveryResponseKeys: [String: String]
    let networkRequestKeys: [String: String]
    let networkResponseKeys: [String: String]
    let signatureHeaderKeys: [String: String]
    let signatureRequestKeys: [String: String]
    let signatureResponseKeys: [String: String]
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
}

final class FolioleCompanionContractStore {
    private let bridge: [String: Any]
    private let sync: [String: Any]

    init(bundle: Bundle? = nil) throws {
        let contractBundle = bundle ?? Self.defaultBundle
        bridge = try Self.load("companion-bridge-contract-definitions", bundle: contractBundle)
        sync = try Self.load("companion-sync-protocol-definitions", bundle: contractBundle)
    }

    private static var defaultBundle: Bundle {
        #if SWIFT_PACKAGE
        return .module
        #else
        return .main
        #endif
    }

    func networkContract() throws -> FolioleCompanionNetworkContract {
        FolioleCompanionNetworkContract(
            protocolCapabilities: try strings(path: ["syncProtocol", "capabilities"], root: sync),
            protocolMaximumVersion: try integer(path: ["syncProtocol", "max_supported_version"], root: sync),
            protocolMinimumVersion: try integer(path: ["syncProtocol", "min_supported_version"], root: sync),
            protocolVersion: try integer(path: ["syncProtocol", "version"], root: sync),
            discoveryCandidateKeys: try stringMap(path: ["hostApi", "network", "discoveryCandidateKeys"], root: bridge),
            discoveryResponseKeys: try stringMap(path: ["hostApi", "network", "discoveryResponseKeys"], root: bridge),
            networkRequestKeys: try stringMap(path: ["hostApi", "network", "requestKeys"], root: bridge),
            networkResponseKeys: try stringMap(path: ["hostApi", "network", "responseKeys"], root: bridge),
            signatureHeaderKeys: try stringMap(path: ["syncGroupSecurity", "signature", "headerKeys"], root: bridge),
            signatureRequestKeys: try stringMap(path: ["syncGroupSecurity", "signature", "requestKeys"], root: bridge),
            signatureResponseKeys: try stringMap(path: ["syncGroupSecurity", "signature", "responseKeys"], root: bridge)
        )
    }

    func syncGroupProviderContract() throws -> [String: Any] {
        try object(path: ["hostApi", "syncGroupProvider"], root: bridge)
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
            sql: try stringMap(path: ["sql"], root: root)
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
