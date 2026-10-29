package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.DailyFlowTableRecord;
import java.util.Arrays;

final class DailyFlowTableValidation {
    private DailyFlowTableValidation() {}

    static void validate(ProtocolMessage message) throws FramedSyncValidationException {
        if (message.getSerializedSize() > 256 * 1024) throw invalid();
        switch (message.getPayloadCase()) {
            case DAILY_FLOW_TABLE_BEGIN:
                var begin = message.getDailyFlowTableBegin();
                id(begin.getListId()); id(begin.getSnapshotId()); id(begin.getRequestedFactId());
                if (!Arrays.asList("current_table", "root_history", "operation").contains(begin.getPurpose())) throw invalid();
                FramedSyncValueValidator.protocolString(begin.getHeadId());
                FramedSyncValueValidator.protocolString(begin.getSessionJson());
                FramedSyncValueValidator.protocolString(begin.getMode());
                safe(begin.getMemberCount());
                break;
            case DAILY_FLOW_TABLE_BATCH:
                var batch = message.getDailyFlowTableBatch();
                if (batch.getRecordsCount() < 1 || batch.getRecordsCount() > 256) throw invalid();
                for (var record : batch.getRecordsList()) record(record);
                break;
            case DAILY_FLOW_TABLE_END:
                var end = message.getDailyFlowTableEnd();
                safe(end.getRecordCount());
                FramedSyncValueValidator.digest(end.getTableHash(), "table_hash");
                break;
            default: throw invalid();
        }
    }

    private static void record(DailyFlowTableRecord record) throws FramedSyncValidationException {
        switch (record.getRecordCase()) {
            case FACT:
                id(record.getFact().getFactId());
                FramedSyncValueValidator.protocolString(record.getFact().getPayloadJson());
                if (record.getFact().getPayloadJson().length() > 64 * 1024) throw invalid();
                FramedSyncValueValidator.digest(record.getFact().getContentHash(), "content_hash");
                break;
            case ROW:
                var row = record.getRow();
                id(row.getFactId()); id(row.getNodeId());
                if (!Arrays.asList("rows", "removedNodeIds", "before", "after").contains(row.getSlot())) throw invalid();
                safe(row.getOrderKey()); bits(row.getActive(), row.getHandled(), row.getInitialTask());
                FramedSyncValueValidator.protocolString(row.getCohort());
                break;
            case MEMBER:
                var member = record.getMember();
                id(member.getNodeId()); safe(member.getOrderKey());
                bits(member.getActive(), member.getHandled(), member.getInitialTask());
                if (!Arrays.asList("current", "before", "after").contains(member.getSlot())) throw invalid();
                FramedSyncValueValidator.protocolString(member.getCohort());
                break;
            case APPLIED_FACT_ID: id(record.getAppliedFactId()); break;
            case DEPENDENCY:
                var dependency = record.getDependency(); id(dependency.getNodeId());
                FramedSyncValueValidator.protocolString(dependency.getVersionId());
                FramedSyncValueValidator.protocolString(dependency.getReadingHash());
                FramedSyncValueValidator.protocolString(dependency.getReadingUpdatedAt());
                FramedSyncValueValidator.protocolString(dependency.getReviewFactId());
                FramedSyncValueValidator.protocolString(dependency.getReadingLastHandledAt());
                safe(dependency.getReadingRepetitionCount());
                break;
            default: throw invalid();
        }
    }

    private static void id(String value) throws FramedSyncValidationException {
        FramedSyncValueValidator.text(value, "daily_flow_id");
        if (value.length() > 1024) throw invalid();
    }
    private static void safe(long value) throws FramedSyncValidationException {
        if (value < 0 || value > 9007199254740991L) throw invalid();
    }
    private static void bits(int... values) throws FramedSyncValidationException {
        for (int value : values) if (value < 0 || value > 1) throw invalid();
    }
    private static FramedSyncValidationException invalid() {
        return new FramedSyncValidationException("daily_flow_table_invalid");
    }
}
