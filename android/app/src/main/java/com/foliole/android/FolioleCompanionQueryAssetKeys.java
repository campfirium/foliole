package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionQueryAssetKeys {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionQueryAssetKeys() {}

    static JSONObject section(Context context, String key) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH));
        JSONObject section = payload.optJSONObject(key(context, key));
        if (section == null) {
            throw new IllegalStateException("Companion query definitions asset is missing section: " + key);
        }
        return section;
    }

    static String key(Context context, String key) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH));
        JSONObject assetKeys = payload.optJSONObject("assetKeys");
        if (assetKeys == null) {
            throw new IllegalStateException("Companion query definitions asset is missing asset keys.");
        }
        return assetKeys.getString(key);
    }
}
