package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionRuntimeMutationRules {
    private FolioleCompanionRuntimeMutationRules() {}

    static String syncPushAckString(Context context, String key) throws Exception {
        return group(context, "syncPushAck").getString(key);
    }

    static String syncStateString(Context context, String key) throws Exception {
        return group(context, "syncState").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionMutationAssetKeys.ruleGroup(context, "runtimeMutations", groupName);
    }
}
