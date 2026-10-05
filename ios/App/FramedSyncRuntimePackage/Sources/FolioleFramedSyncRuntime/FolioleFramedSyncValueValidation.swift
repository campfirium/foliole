import Foundation

enum FolioleFramedSyncValueValidator {
    static func digest(_ value: Data, _ name: String) throws {
        guard value.count == FolioleFramedSyncLimits.digestBytes else {
            throw FolioleFramedSyncValidationError("\(name)_must_be_32_bytes")
        }
    }

    static func fixed(_ value: Data, count: Int, _ name: String) throws {
        guard value.count == count else {
            throw FolioleFramedSyncValidationError("\(name)_length_invalid")
        }
    }

    static func text(_ value: String, _ name: String) throws {
        guard !value.isEmpty else { throw FolioleFramedSyncValidationError("protocol_string_required") }
        guard value.lengthOfBytes(using: .utf8) <= FolioleFramedSyncLimits.maxProtocolStringBytes else {
            throw FolioleFramedSyncValidationError("protocol_string_limit_exceeded")
        }
    }

    static func list<T>(_ value: [T], limit: Int) throws {
        guard value.count <= limit else {
            throw FolioleFramedSyncValidationError("protocol_repeated_limit_exceeded")
        }
    }

    static func unique<T: Hashable>(_ values: [T], _ name: String) throws {
        guard Set(values).count == values.count else {
            throw FolioleFramedSyncValidationError("\(name)_duplicate")
        }
    }

    static func identity(_ value: Foliole_Sync_V22_FactIdentity) throws -> String {
        guard (1...8).contains(value.kind.rawValue) else {
            throw FolioleFramedSyncValidationError("fact_kind_invalid")
        }
        try text(value.objectType, "objectType")
        try text(value.globalID, "globalId")
        try text(value.factID, "factId")
        return "\(value.kind.rawValue)\0\(value.objectType)\0\(value.globalID)\0\(value.factID)"
    }

    static func identities(_ values: [Foliole_Sync_V22_FactIdentity]) throws {
        try list(values, limit: FolioleFramedSyncLimits.maxFactsPerTransfer)
        try unique(try values.map(identity), "fact_identity")
    }

    static func blob(_ value: Foliole_Sync_V22_BlobReference) throws -> Data {
        try digest(value.sha256, "blob_hash")
        guard (1...5).contains(value.role.rawValue) else {
            throw FolioleFramedSyncValidationError("blob_role_invalid")
        }
        guard value.byteLength <= FolioleFramedSyncLimits.maxBlobBytes else {
            throw FolioleFramedSyncValidationError("blob_byte_length_limit_exceeded")
        }
        return value.sha256
    }

    static func blobs(_ values: [Foliole_Sync_V22_BlobReference], name: String) throws -> [Data] {
        try list(values, limit: FolioleFramedSyncLimits.maxBlobsPerTransfer)
        let hashes = try values.map(blob)
        try unique(hashes, name)
        return hashes
    }

    static func fact(_ value: Foliole_Sync_V22_FactRecord) throws {
        guard value.hasIdentity, value.hasBody else {
            throw FolioleFramedSyncValidationError("protocol_object_required")
        }
        _ = try identity(value.identity)
        try digest(value.sharedStateHash, "shared_state_hash")
        try canonicalObject(value.body, depth: 0)
        _ = try blobs(value.blobs, name: "fact_blob")
    }

    static func manifest(_ value: Foliole_Sync_V22_TransferManifest) throws {
        guard value.protocolVersion == FolioleFramedSyncLimits.protocolVersion else {
            throw FolioleFramedSyncValidationError("protocol_version_invalid")
        }
        try text(value.groupID, "group_id")
        try digest(value.contentID, "content_id")
        try list(value.facts, limit: FolioleFramedSyncLimits.maxFactsPerTransfer)
        guard value.facts.allSatisfy(\.hasIdentity) else {
            throw FolioleFramedSyncValidationError("protocol_object_required")
        }
        let identities = try value.facts.map { try identity($0.identity) }
        try unique(identities, "manifest_fact")
        let declared = Set(try blobs(value.blobs, name: "manifest_blob"))
        for fact in value.facts {
            try digest(fact.sharedStateHash, "shared_state_hash")
            try list(fact.requiredBlobHashes, limit: FolioleFramedSyncLimits.maxFactBlobEdges)
            try fact.requiredBlobHashes.forEach { try digest($0, "blob_hash") }
            try unique(fact.requiredBlobHashes, "required_blob_hash")
            guard fact.requiredBlobHashes.allSatisfy(declared.contains) else {
                throw FolioleFramedSyncValidationError("required_blob_undeclared")
            }
        }
    }

    static func capabilities(_ values: [Foliole_Sync_V22_Capability]) throws {
        try list(values, limit: FolioleFramedSyncLimits.maxProtocolCapabilities)
        for value in values {
            try text(value.name, "capability_name")
            guard value.version > 0 else {
                throw FolioleFramedSyncValidationError("capability_version_invalid")
            }
        }
        try unique(values.map(\.name), "capability")
    }

    private static func canonicalObject(
        _ value: Foliole_Sync_V22_CanonicalObject,
        depth: Int
    ) throws {
        guard depth <= FolioleFramedSyncLimits.maxCanonicalDepth else {
            throw FolioleFramedSyncValidationError("canonical_depth_limit_exceeded")
        }
        try list(value.fields, limit: FolioleFramedSyncLimits.maxDecodedRepeatedItems)
        try unique(value.fields.map(\.name), "canonical_field")
        for field in value.fields {
            try text(field.name, "canonical_field_name")
            guard field.hasValue else {
                throw FolioleFramedSyncValidationError("canonical_value_case_invalid")
            }
            try canonicalValue(field.value, depth: depth + 1)
        }
    }

    private static func canonicalValue(
        _ value: Foliole_Sync_V22_CanonicalValue,
        depth: Int
    ) throws {
        guard depth <= FolioleFramedSyncLimits.maxCanonicalDepth else {
            throw FolioleFramedSyncValidationError("canonical_depth_limit_exceeded")
        }
        guard let selected = value.value else {
            throw FolioleFramedSyncValidationError("canonical_value_case_invalid")
        }
        switch selected {
        case .stringValue(let value): try text(value, "protocol_string")
        case .bytesValue(let value):
            guard value.count <= FolioleFramedSyncLimits.maxFrameMessageBytes else {
                throw FolioleFramedSyncValidationError("protocol_bytes_limit_exceeded")
            }
        case .listValue(let value):
            try list(value.values, limit: FolioleFramedSyncLimits.maxDecodedRepeatedItems)
            try value.values.forEach { try canonicalValue($0, depth: depth + 1) }
        case .objectValue(let value): try canonicalObject(value, depth: depth + 1)
        case .nullValue(let value):
            guard value else { throw FolioleFramedSyncValidationError("canonical_null_invalid") }
        case .boolValue, .signedValue, .unsignedValue: break
        }
    }
}
