package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncPushAckStore {

    private FolioleCompanionSyncPushAckStore() {}

    static JSObject saveAcks(Context context, SQLiteDatabase database, JSONArray acks) throws Exception {
        JSArray savedClientOpIds = new JSArray();
        FolioleCompanionSyncPushAckRules rules = FolioleCompanionSyncPushAckRules.load(context);
        if (acks == null) {
            JSObject result = new JSObject();
            result.put(rules.resultSavedClientOpIdsKey(), savedClientOpIds);
            return result;
        }
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            for (int index = 0; index < acks.length(); index += 1) {
                JSONObject ack = acks.optJSONObject(index);
                if (ack == null || !rules.isKnownStatus(ack)) {
                    continue;
                }
                JSONObject identity = rules.identity(ack);
                if (!rules.hasRequiredFields(ack, identity)) {
                    continue;
                }
                String clientOpId = rules.clientOpId(ack);
                String objectType = rules.objectType(identity);
                String objectId = rules.objectId(identity);
                FolioleCompanionGeneratedMutationRunner.execute(
                    context,
                    database,
                    mutationRule(context, "deleteIssuesMutationName"),
                    new Object[] { objectType, objectId }
                );
                FolioleCompanionGeneratedMutationRunner.execute(
                    context,
                    database,
                    mutationRule(context, "upsertMutationName"),
                    new Object[] {
                        clientOpId,
                        objectType,
                        objectId,
                        rules.stateSeq(ack),
                        rules.status(ack),
                        now
                    }
                );
                savedClientOpIds.put(clientOpId);
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put(rules.resultSavedClientOpIdsKey(), savedClientOpIds);
        return result;
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionSyncApplyMutationRules.string(context, "pushAck", key);
    }
}
