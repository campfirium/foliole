package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class FolioleCompanionSchemaInstaller {

    private static final String SCHEMA_ASSET_PATH = "companion-core-schema.json";

    private FolioleCompanionSchemaInstaller() {}

    static void install(Context context, SQLiteDatabase database) throws Exception {
        JSONObject payload = new JSONObject(readAsset(context, SCHEMA_ASSET_PATH));
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

    private static String readAsset(Context context, String assetPath) throws Exception {
        try (InputStream input = context.getAssets().open(assetPath);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8);
        }
    }
}
