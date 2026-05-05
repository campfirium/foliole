package com.foliole.android;

import android.content.Context;

final class FolioleCompanionSyncConflictQueryRules {
    private FolioleCompanionSyncConflictQueryRules() {}

    static String nodeConflictsQueryName(Context context) throws Exception {
        return nodeConflictsString(context, "queryName");
    }

    private static String nodeConflictsString(Context context, String key) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncConflictRead", "nodeConflicts").getString(key);
    }
}
