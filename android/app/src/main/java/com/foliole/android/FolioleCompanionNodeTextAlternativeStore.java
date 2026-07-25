package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class FolioleCompanionNodeTextAlternativeStore {
    private FolioleCompanionNodeTextAlternativeStore() {}

    static JSObject load(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        JSObject result = new JSObject();
        JSONObject row = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context, database, "nodeTextAlternativeAvailable", "rows", new String[] { nodeId }
        );
        result.put("alternative", row == null ? JSONObject.NULL : row);
        return result;
    }

    static JSObject updateStatus(
        Context context, SQLiteDatabase database, String alternativeId, String status, String updatedAt
    ) throws Exception {
        if (!"dismissed".equals(status) && !"promoted".equals(status)) {
            throw new IllegalArgumentException("Unsupported alternative status.");
        }
        database.beginTransaction();
        try {
            FolioleCompanionGeneratedMutationRunner.execute(
                context, database, "nodeTextAlternativeUpdateStatus",
                new Object[] { status, updatedAt, alternativeId }
            );
            JSObject alternative = loadById(context, database, alternativeId);
            if (alternative == null) throw new IllegalArgumentException("Alternative not found.");
            upsertSyncState(context, database, alternativeId, alternative, updatedAt);
            database.setTransactionSuccessful();
            JSObject result = new JSObject();
            result.put("alternative", alternative);
            return result;
        } finally {
            database.endTransaction();
        }
    }

    private static JSObject loadById(Context context, SQLiteDatabase database, String alternativeId) throws Exception {
        JSONObject row = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context, database, "nodeTextAlternativeById", "rows", new String[] { alternativeId }
        );
        return row == null ? null : new JSObject(row.toString());
    }

    private static void upsertSyncState(
        Context context,
        SQLiteDatabase database,
        String alternativeId,
        JSObject payload,
        String updatedAt
    ) throws Exception {
        FolioleCompanionGeneratedMutationRunner.upsertSyncStateRow(
            context, database, "node_text_alternative", alternativeId, null,
            sha256(payload.toString()), "android", updatedAt, null, 1
        );
    }

    private static String sha256(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte item : digest) hex.append(String.format("%02x", item));
        return hex.toString();
    }
}
