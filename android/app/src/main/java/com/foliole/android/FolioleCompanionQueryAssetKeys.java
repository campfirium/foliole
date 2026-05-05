package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionQueryAssetKeys {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionQueryAssetKeys() {}

    static String key(Context context, String key) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH));
        JSONObject assetKeys = payload.optJSONObject("assetKeys");
        if (assetKeys == null) {
            throw new IllegalStateException("Companion query definitions asset is missing asset keys.");
        }
        return assetKeys.getString(key);
    }
}
