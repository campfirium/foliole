package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSchemaInstaller {

    private static final String SCHEMA_ASSET_PATH = "companion-core-schema.json";
    private static final String MIGRATION_SCHEMA_ASSET_PATH = "companion-migration-schema.json";

    private FolioleCompanionSchemaInstaller() {}

    static void install(Context context, SQLiteDatabase database) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, SCHEMA_ASSET_PATH));
        JSONArray statements = payload.optJSONArray("statements");
        if (statements == null) {
            throw new IllegalStateException("Companion schema asset is missing statements.");
        }
        for (int index = 0; index < statements.length(); index += 1) {
            String statement = statements.optString(index, "").trim();
            if (!statement.isEmpty()) {
                database.execSQL(statement);
            }
        }
    }

    static void installMigrationStatement(Context context, SQLiteDatabase database, String statementName) throws Exception {
        JSONObject payload = migrationSchema(context);
        JSONObject statements = payload.optJSONObject("statementsByName");
        if (statements == null) {
            throw new IllegalStateException("Companion migration schema asset is missing statementsByName.");
        }
        String statement = statements.optString(statementName, "").trim();
        if (statement.isEmpty()) {
            throw new IllegalStateException("Companion migration schema asset is missing statement: " + statementName);
        }
        database.execSQL(statement);
    }

    static JSONArray migrationPlan(Context context) throws Exception {
        JSONArray plan = migrationSchema(context).optJSONArray("plan");
        if (plan == null) {
            throw new IllegalStateException("Companion migration schema asset is missing plan.");
        }
        return plan;
    }

    private static JSONObject migrationSchema(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, MIGRATION_SCHEMA_ASSET_PATH));
    }
}
