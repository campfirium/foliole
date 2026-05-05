package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class FolioleCompanionTextBodyBlobs {

    private FolioleCompanionTextBodyBlobs() {}

    static String upsert(Context context, SQLiteDatabase database, String content, String now) throws Exception {
        if (
            !FolioleCompanionSqliteRuntime.tableExists(database, resourceRule(context, "manifestTableName")) ||
            !FolioleCompanionSqliteRuntime.tableExists(database, resourceRule(context, "dataTableName"))
        ) {
            return null;
        }
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        String hash = sha256(bytes);
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "manifestInsertMutationName"), new Object[] {
            hash,
            "text/" + hash,
            "text_body",
            "text/plain",
            "none",
            bytes.length,
            bytes.length,
            hash,
            hash,
            "local",
            now,
            now,
            now
        });
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "dataInsertMutationName"), new Object[] { hash, bytes });
        return hash;
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionHostSupportMutationRules.textBodyBlobString(context, key);
    }

    private static String resourceRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobString(context, key);
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : hash) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
