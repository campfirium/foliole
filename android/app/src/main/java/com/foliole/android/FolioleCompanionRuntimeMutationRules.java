package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionRuntimeMutationRules {
    private static final String MUTATION_ASSET_PATH = "companion-mutation-definitions.json";

    private FolioleCompanionRuntimeMutationRules() {}

    static String syncPushAckString(Context context, String key) throws Exception {
        return group(context, "syncPushAck").getString(key);
    }

    static String syncStateString(Context context, String key) throws Exception {
        return group(context, "syncState").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH))
            .optJSONObject(FolioleCompanionMutationAssetKeys.key(context, "runtimeMutations"));
        if (rules == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing runtime mutation rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing runtime mutation rule: " + groupName);
        }
        return group;
    }
}
