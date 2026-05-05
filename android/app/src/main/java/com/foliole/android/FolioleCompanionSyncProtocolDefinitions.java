package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncProtocolDefinitions {
    private static final String PROTOCOL_ASSET_PATH = "companion-sync-protocol-definitions.json";

    private FolioleCompanionSyncProtocolDefinitions() {}

    static JSONObject load(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, PROTOCOL_ASSET_PATH));
    }

    static String syncObjectType(Context context, String key) throws Exception {
        String objectType = load(context).getJSONObject("syncObjectTypes").optString(key, "").trim();
        if (objectType.isEmpty()) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing sync object type: " + key);
        }
        return objectType;
    }
}
