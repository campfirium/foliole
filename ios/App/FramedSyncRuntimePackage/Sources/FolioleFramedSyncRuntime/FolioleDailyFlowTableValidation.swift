import Foundation
import SwiftProtobuf

enum FolioleDailyFlowTableValidation {
    private typealias Value = FolioleFramedSyncValueValidator

    static func begin(_ value: Foliole_Sync_V22_DailyFlowTableBegin) throws {
        try id(value.listID); try id(value.snapshotID); try id(value.requestedFactID)
        guard ["current_table", "root_history", "operation"].contains(value.purpose) else { throw invalid() }
        try Value.protocolString(value.headID)
        try Value.protocolString(value.sessionJson)
        try Value.protocolString(value.mode)
        try safe(value.memberCount)
        try size(value)
    }

    static func batch(_ value: Foliole_Sync_V22_DailyFlowTableBatch) throws {
        guard (1...256).contains(value.records.count) else { throw invalid() }
        for item in value.records {
            guard let record = item.record else { throw invalid() }
            switch record {
            case .fact(let fact):
                try id(fact.factID); try Value.protocolString(fact.payloadJson)
                guard fact.payloadJson.utf16.count <= 64 * 1024 else { throw invalid() }
                try Value.digest(fact.contentHash, "content_hash")
            case .row(let row):
                try id(row.factID); try id(row.nodeID); try safe(row.orderKey)
                guard ["rows", "removedNodeIds", "before", "after"].contains(row.slot) else { throw invalid() }
                try bits(row.active, row.handled, row.initialTask); try Value.protocolString(row.cohort)
            case .member(let member):
                try id(member.nodeID); try safe(member.orderKey)
                guard ["current", "before", "after"].contains(member.slot) else { throw invalid() }
                try bits(member.active, member.handled, member.initialTask); try Value.protocolString(member.cohort)
            case .appliedFactID(let factID): try id(factID)
            case .dependency(let dependency):
                try id(dependency.nodeID); try Value.protocolString(dependency.versionID)
                try Value.protocolString(dependency.readingHash); try Value.protocolString(dependency.readingUpdatedAt)
                try Value.protocolString(dependency.reviewFactID)
                try Value.protocolString(dependency.readingLastHandledAt); try safe(dependency.readingRepetitionCount)
            }
        }
        try size(value)
    }

    static func end(_ value: Foliole_Sync_V22_DailyFlowTableEnd) throws {
        try safe(value.recordCount); try Value.digest(value.tableHash, "table_hash"); try size(value)
    }

    private static func id(_ value: String) throws {
        try Value.text(value, "daily_flow_id")
        guard value.utf16.count <= 1024 else { throw invalid() }
    }
    private static func safe(_ value: UInt64) throws {
        guard value <= 9_007_199_254_740_991 else { throw invalid() }
    }
    private static func bits(_ values: UInt32...) throws {
        guard values.allSatisfy({ $0 <= 1 }) else { throw invalid() }
    }
    private static func size<T: Message>(_ value: T) throws {
        let count = try value.serializedData().count
        let lengthBytes = count < 128 ? 1 : count < 16_384 ? 2 : 3
        guard count + 2 + lengthBytes <= 256 * 1024 else { throw invalid() }
    }
    private static func invalid() -> FolioleFramedSyncValidationError {
        FolioleFramedSyncValidationError("daily_flow_table_invalid")
    }
}
