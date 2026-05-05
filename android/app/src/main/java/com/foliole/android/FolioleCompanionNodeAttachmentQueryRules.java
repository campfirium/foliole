package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionNodeAttachmentQueryRules {
    private FolioleCompanionNodeAttachmentQueryRules() {}

    static String backfillSnapshotString(Context context, String key) throws Exception {
        return group(context, "backfillSnapshots").getString(key);
    }

    static String nodeAttachmentString(Context context, String key) throws Exception {
        return group(context, "nodeAttachments").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "nodeAttachmentRead", groupName);
    }
}
