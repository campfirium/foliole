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
                if (ack == null || !isAccepted(ack)) {
                    continue;
                }
                JSONObject identity = ack.optJSONObject("identity");
                if (identity == null || identity.optString("objectType").trim().isEmpty()) {
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

    private static boolean isAccepted(JSONObject ack) {
        String status = ack.optString("status");
        return status.equals("accepted") || status.equals("already_applied");
    }
}
