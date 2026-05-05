package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionMutationAssetKeys {
    private static final String MUTATION_ASSET_PATH = "companion-mutation-definitions.json";

    private FolioleCompanionMutationAssetKeys() {}

    static String key(Context context, String key) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH));
        JSONObject assetKeys = payload.optJSONObject("assetKeys");
        if (assetKeys == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing asset keys.");
        }
        return assetKeys.getString(key);
    }
}
