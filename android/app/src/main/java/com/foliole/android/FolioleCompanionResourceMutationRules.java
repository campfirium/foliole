package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionResourceMutationRules {
    private static final String MUTATION_ASSET_PATH = "companion-mutation-definitions.json";

    private FolioleCompanionResourceMutationRules() {}

    static String attachmentString(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getString(key);
    }

    static String contentBlobString(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH))
            .optJSONObject(FolioleCompanionMutationAssetKeys.key(context, "resourceMutations"));
        if (rules == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing resource mutation rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing resource mutation rule: " + groupName);
        }
        return group;
    }
}
