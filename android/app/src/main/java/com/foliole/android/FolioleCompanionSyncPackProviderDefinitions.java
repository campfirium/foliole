package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncPackProviderDefinitions {
    private static final String ASSET = "companion-sync-pack-provider-definitions.json";
    private final JSONObject value;

    private FolioleCompanionSyncPackProviderDefinitions(JSONObject value) { this.value = value; }

    static FolioleCompanionSyncPackProviderDefinitions load(Context context) throws Exception {
        return new FolioleCompanionSyncPackProviderDefinitions(new JSONObject(FolioleCompanionAssetReader.read(context, ASSET)));
    }

    JSONArray copyStatements() throws Exception { return value.getJSONArray("copyStatements"); }
    String completenessQuery(String name) throws Exception {
        return value.getJSONObject("completenessQueries").getString(name);
    }
    String databaseEntry() throws Exception { return value.getString("databaseEntry"); }
    String format() throws Exception { return value.getString("format"); }
    int formatVersion() throws Exception { return value.getInt("formatVersion"); }
    JSONArray packSchema() throws Exception { return value.getJSONArray("packSchema"); }
    JSONObject protocol() throws Exception { return value.getJSONObject("protocol"); }
    int schemaVersion() throws Exception { return value.getInt("schemaVersion"); }
    JSONArray tableNames() throws Exception { return value.getJSONArray("tableNames"); }
}
