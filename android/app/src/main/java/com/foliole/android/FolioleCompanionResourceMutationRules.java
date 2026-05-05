package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionResourceMutationRules {
    private FolioleCompanionResourceMutationRules() {}

    static String attachmentString(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getString(key);
    }

    static String contentBlobString(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionMutationAssetKeys.ruleGroup(context, "resourceMutations", groupName);
    }
}
