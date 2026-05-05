package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionHostSupportMutationRules {
    private FolioleCompanionHostSupportMutationRules() {}

    static String appDataString(Context context, String key) throws Exception {
        return group(context, "appData").getString(key);
    }

    static String companionMetaString(Context context, String key) throws Exception {
        return group(context, "companionMeta").getString(key);
    }

    static String nodeAttachmentString(Context context, String key) throws Exception {
        return group(context, "nodeAttachments").getString(key);
    }

    static String string(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    static String textBodyBlobString(Context context, String key) throws Exception {
        return group(context, "textBodyBlobs").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionMutationAssetKeys.ruleGroup(context, "hostSupportMutations", groupName);
    }
}
