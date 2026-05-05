package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncConflictQueryRules {
    private FolioleCompanionSyncConflictQueryRules() {}

    static String nodeConflictsQueryName(Context context) throws Exception {
        JSONObject rules = FolioleCompanionQueryAssetKeys.section(context, "syncConflictRead");
        JSONObject nodeConflicts = rules.optJSONObject("nodeConflicts");
        if (nodeConflicts == null) {
            throw new IllegalStateException("Companion query definitions asset is missing node conflict read rules.");
        }
        return nodeConflicts.getString("queryName");
    }
}
