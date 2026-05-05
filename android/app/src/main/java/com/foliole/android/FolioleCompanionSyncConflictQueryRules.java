package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncConflictQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionSyncConflictQueryRules() {}

    static String nodeConflictsQueryName(Context context) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("syncConflictRead");
        if (rules == null) {
            throw new IllegalStateException("Companion query definitions asset is missing sync conflict read rules.");
        }
        JSONObject nodeConflicts = rules.optJSONObject("nodeConflicts");
        if (nodeConflicts == null) {
            throw new IllegalStateException("Companion query definitions asset is missing node conflict read rules.");
        }
        return nodeConflicts.getString("queryName");
    }
}
