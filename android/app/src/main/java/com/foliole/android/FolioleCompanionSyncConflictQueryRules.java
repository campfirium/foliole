package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncConflictQueryRules {
    private FolioleCompanionSyncConflictQueryRules() {}

    static String nodeConflictsQueryName(Context context) throws Exception {
        JSONObject nodeConflicts = FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncConflictRead", "nodeConflicts");
        return nodeConflicts.getString("queryName");
    }
}
