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
    String databaseEntry() throws Exception { return value.getString("databaseEntry"); }
    String format() throws Exception { return value.getString("format"); }
    int formatVersion() throws Exception { return value.getInt("formatVersion"); }
    String identityThinPreludeSql() throws Exception { return value.getString("identityThinPreludeSql"); }
    String identityMissingOriginalHeadSql() throws Exception { return value.getString("identityMissingOriginalHeadSql"); }
    JSONArray identityFactPlans() throws Exception { return value.getJSONArray("identityFactPlans"); }
    String identityFactValidateSql() throws Exception { return value.getString("identityFactValidateSql"); }
    String identityFactHeadCopySql() throws Exception { return value.getString("identityFactHeadCopySql"); }
    String identityHeadCopySql() throws Exception { return value.getString("identityHeadCopySql"); }
    String identityPreludeCopySql() throws Exception { return value.getString("identityPreludeCopySql"); }
    String identityReviewCopySql() throws Exception { return value.getString("identityReviewCopySql"); }
    String identityStateCopySql() throws Exception { return value.getString("identityStateCopySql"); }
    int payloadCopyIndex() throws Exception { return value.getInt("payloadCopyIndex"); }
    JSONArray payloadPlans() throws Exception { return value.getJSONArray("payloadPlans"); }
    JSONArray packSchema() throws Exception { return value.getJSONArray("packSchema"); }
    int reviewCopyIndex() throws Exception { return value.getInt("reviewCopyIndex"); }
    JSONObject preparedMemberDataPlane() throws Exception { return value.getJSONObject("preparedMemberDataPlane"); }
    JSONObject protocol() throws Exception { return value.getJSONObject("protocol"); }
    int schemaVersion() throws Exception { return value.getInt("schemaVersion"); }
    int stateCopyIndex() throws Exception { return value.getInt("stateCopyIndex"); }
    JSONArray tableNames() throws Exception { return value.getJSONArray("tableNames"); }
    String versionPreflightSql() throws Exception { return value.getString("versionPreflightSql"); }
}
