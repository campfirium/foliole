import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncCanonicalManifest {
    static func contentID(
        facts: [Foliole_Sync_V22_FactRecord], blobs: [Foliole_Sync_V22_BlobReference]
    ) throws -> Data {
        var writer = Writer()
        writer.string("foliole-framed-sync-content-v1")
        let facts = facts.sorted(by: factOrder)
        writer.u32(facts.count)
        for fact in facts { try write(fact, to: &writer) }
        let blobs = blobs.sorted { $0.sha256.lexicographicallyPrecedes($1.sha256) }
        writer.u32(blobs.count)
        for blob in blobs { write(blob, to: &writer) }
        return Data(SHA256.hash(data: writer.data))
    }

    private static func write(_ fact: Foliole_Sync_V22_FactRecord, to writer: inout Writer) throws {
        writer.u32(Int(fact.identity.kind.rawValue))
        writer.string(fact.identity.objectType); writer.string(fact.identity.globalID)
        writer.string(fact.identity.factID); writer.bytes(fact.sharedStateHash)
        try write(fact.body, to: &writer, depth: 0)
        let blobs = fact.blobs.sorted { $0.sha256.lexicographicallyPrecedes($1.sha256) }
        writer.u32(blobs.count)
        for blob in blobs { write(blob, to: &writer) }
    }

    private static func write(_ blob: Foliole_Sync_V22_BlobReference, to writer: inout Writer) {
        writer.bytes(blob.sha256); writer.u64(blob.byteLength)
        writer.u32(Int(blob.role.rawValue)); writer.byte(blob.required ? 1 : 0)
    }

    private static func write(
        _ object: Foliole_Sync_V22_CanonicalObject, to writer: inout Writer, depth: Int
    ) throws {
        guard depth <= 32 else { throw invalid("canonical_depth_limit_exceeded") }
        let fields = object.fields.sorted { $0.name.utf8.lexicographicallyPrecedes($1.name.utf8) }
        writer.u32(fields.count)
        for field in fields { writer.string(field.name); try write(field.value, to: &writer, depth: depth + 1) }
    }

    private static func write(
        _ value: Foliole_Sync_V22_CanonicalValue, to writer: inout Writer, depth: Int
    ) throws {
        guard depth <= 32 else { throw invalid("canonical_depth_limit_exceeded") }
        switch value.value {
        case .nullValue: writer.byte(0)
        case .boolValue(let value): writer.byte(value ? 2 : 1)
        case .signedValue(let value): writer.byte(3); writer.u64(UInt64(bitPattern: value))
        case .unsignedValue(let value): writer.byte(4); writer.u64(value)
        case .stringValue(let value): writer.byte(5); writer.string(value)
        case .bytesValue(let value): writer.byte(6); writer.bytes(value)
        case .listValue(let list):
            writer.byte(7); writer.u32(list.values.count)
            for child in list.values { try write(child, to: &writer, depth: depth + 1) }
        case .objectValue(let object): writer.byte(8); try write(object, to: &writer, depth: depth + 1)
        case nil: throw invalid("canonical_value_case_invalid")
        }
    }

    private static func factOrder(
        _ left: Foliole_Sync_V22_FactRecord, _ right: Foliole_Sync_V22_FactRecord
    ) -> Bool {
        let a = left.identity, b = right.identity
        if a.kind.rawValue != b.kind.rawValue { return a.kind.rawValue < b.kind.rawValue }
        if a.objectType != b.objectType { return a.objectType.utf8.lexicographicallyPrecedes(b.objectType.utf8) }
        if a.globalID != b.globalID { return a.globalID.utf8.lexicographicallyPrecedes(b.globalID.utf8) }
        return a.factID.utf8.lexicographicallyPrecedes(b.factID.utf8)
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError {
        FolioleFramedSyncValidationError(code)
    }
}

private struct Writer {
    var data = Data()
    mutating func byte(_ value: Int) { data.append(UInt8(value)) }
    mutating func bytes(_ value: Data) { u32(value.count); data.append(value) }
    mutating func string(_ value: String) { bytes(Data(value.utf8)) }
    mutating func u32(_ value: Int) { data.appendUInt32BE(UInt32(value)) }
    mutating func u64(_ value: UInt64) { data.appendUInt64BE(value) }
}
