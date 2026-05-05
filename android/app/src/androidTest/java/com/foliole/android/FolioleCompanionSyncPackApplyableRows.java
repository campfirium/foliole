package com.foliole.android;

final class FolioleCompanionSyncPackApplyableRows {
    private FolioleCompanionSyncPackApplyableRows() {}

    static String sql(String objectType) {
        String typeFilter = objectType == null ? "" : " AND incoming.object_type = '" + objectType + "'";
        return "(SELECT incoming.object_type, incoming.object_id, incoming.state_seq, incoming.content_hash, " +
            "incoming.updated_at, incoming.deleted_at FROM inc.sync_object_state incoming " +
            "LEFT JOIN main.sync_object_state current ON current.object_type = incoming.object_type " +
            "AND current.object_id = incoming.object_id WHERE " +
            "(current.object_id IS NULL OR (current.updated_at <= incoming.updated_at " +
            "AND (current.sync_dirty <> 1 OR EXISTS (" +
            "SELECT 1 FROM main.sync_push_ack ack WHERE ack.object_type = incoming.object_type " +
            "AND ack.object_id = incoming.object_id AND ack.state_seq IS NOT NULL " +
            "AND incoming.state_seq >= ack.state_seq AND incoming.content_hash = current.content_hash))))" +
            typeFilter + ")";
    }
}
