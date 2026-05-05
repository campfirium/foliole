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
        JSONObject rules = FolioleCompanionQueryAssetKeys.section(context, "nodeAttachmentRead");
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing node attachment read rule: " + groupName);
        }
        return group;
    }
}
