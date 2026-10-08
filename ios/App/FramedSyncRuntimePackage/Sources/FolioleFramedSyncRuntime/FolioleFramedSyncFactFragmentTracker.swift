import Foundation

/** Holds transport metadata only; original fact bytes belong to durable frame staging. */
public struct FolioleFramedSyncFactFragmentTracker {
    public let identity: Foliole_Sync_V22_FactIdentity
    public let sharedStateHash: Data
    public let encodedSHA256: Data
    public let totalByteLength: UInt64
    public let firstSequence: UInt64
    public private(set) var lastSequence: UInt64
    public private(set) var expectedOffset: UInt64 = 0
    public var complete: Bool { expectedOffset == totalByteLength }

    public init(first: Foliole_Sync_V22_FactFragment, sequence: UInt64) throws {
        guard first.offset == 0,
              first.totalByteLength > UInt64(FolioleFramedSyncLimits.maxFrameMessageBytes),
              first.totalByteLength <= UInt64(FolioleFramedSyncLimits.maxFragmentedFactBytes) else {
            throw FolioleFramedSyncValidationError("fact_fragment_offset_invalid")
        }
        identity = first.identity
        sharedStateHash = first.sharedStateHash
        encodedSHA256 = first.encodedSha256
        totalByteLength = first.totalByteLength
        firstSequence = sequence
        lastSequence = sequence
    }

    public mutating func append(_ fragment: Foliole_Sync_V22_FactFragment, sequence: UInt64) throws {
        guard !complete, fragment.identity == identity, fragment.sharedStateHash == sharedStateHash,
              fragment.encodedSha256 == encodedSHA256, fragment.totalByteLength == totalByteLength,
              fragment.offset == expectedOffset,
              sequence == (expectedOffset == 0 ? firstSequence : lastSequence + 1),
              !fragment.data.isEmpty, fragment.data.count <= 512 * 1024,
              UInt64(fragment.data.count) <= totalByteLength - expectedOffset else {
            throw FolioleFramedSyncValidationError("fact_fragment_identity_or_offset_conflict")
        }
        expectedOffset += UInt64(fragment.data.count)
        lastSequence = sequence
    }
}
