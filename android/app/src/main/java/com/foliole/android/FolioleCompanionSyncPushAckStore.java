package com.foliole.android;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncPushAckStore {

    private FolioleCompanionSyncPushAckStore() {}

    static JSObject saveAcks(SQLiteDatabase database, JSONArray acks) throws Exception {
        JSArray savedClientOpIds = new JSArray();
        if (acks == null) {
            JSObject result = new JSObject();
            result.put("saved_client_op_ids", savedClientOpIds);
            return result;
        }
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            for (int index = 0; index < acks.length(); index += 1) {
                JSONObject ack = acks.optJSONObject(index);
                if (ack == null || !isKnownStatus(ack)) {
                    continue;
                }
                JSONObject identity = ack.optJSONObject("identity");
                if (!hasRequiredAckFields(ack, identity)) {
                    continue;
                }
                ContentValues values = new ContentValues();
                values.put("client_op_id", ack.optString("client_op_id", ack.optString("clientOpId")));
                values.put("object_type", identity.optString("objectType"));
                values.put("object_id", identity.optString("objectId"));
                if (ack.has("state_seq") && !ack.isNull("state_seq")) {
                    values.put("state_seq", ack.optLong("state_seq"));
                }
                values.put("status", ack.optString("status"));
                values.put("acked_at", now);
                database.delete(
                    "sync_push_ack",
                    "object_type = ? AND object_id = ? AND status IN ('conflict', 'rejected')",
                    new String[] { values.getAsString("object_type"), values.getAsString("object_id") }
                );
                database.insertWithOnConflict("sync_push_ack", null, values, SQLiteDatabase.CONFLICT_REPLACE);
                savedClientOpIds.put(values.getAsString("client_op_id"));
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("saved_client_op_ids", savedClientOpIds);
        return result;
    }

    private static boolean isKnownStatus(JSONObject ack) {
        String status = ack.optString("status");
        return status.equals("accepted") ||
            status.equals("already_applied") ||
            status.equals("conflict") ||
            status.equals("rejected");
    }

    private static boolean hasRequiredAckFields(JSONObject ack, JSONObject identity) {
        if (identity == null) {
            return false;
        }
        String clientOpId = ack.optString("client_op_id", ack.optString("clientOpId")).trim();
        String objectType = identity.optString("objectType").trim();
        String objectId = identity.optString("objectId").trim();
        String status = ack.optString("status");
        boolean canConfirm = status.equals("accepted") || status.equals("already_applied");
        if (canConfirm && objectType.equals("review_log")) {
            return false;
        }
        if (canConfirm && objectType.equals("node")) {
            return !clientOpId.isEmpty() && !objectId.isEmpty();
        }
        return !clientOpId.isEmpty() &&
            !objectType.isEmpty() &&
            !objectId.isEmpty() &&
            (!canConfirm || (ack.has("state_seq") && !ack.isNull("state_seq")));
    }
}
