package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionNodeAttachmentQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionNodeAttachmentQueryRules() {}

    static String backfillSnapshotString(Context context, String key) throws Exception {
        return group(context, "backfillSnapshots").getString(key);
    }

    static String nodeAttachmentString(Context context, String key) throws Exception {
        return group(context, "nodeAttachments").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("nodeAttachmentRead");
        if (rules == null) {
            throw new IllegalStateException("Companion query definitions asset is missing node attachment read rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing node attachment read rule: " + groupName);
        }
        return group;
    }
}
