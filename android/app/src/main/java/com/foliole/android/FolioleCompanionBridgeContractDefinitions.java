package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionBridgeContractDefinitions {
    private static final String BRIDGE_CONTRACT_ASSET_PATH = "companion-bridge-contract-definitions.json";

    private FolioleCompanionBridgeContractDefinitions() {}

    static int resourceDefault(Context context, String key) throws Exception {
        return section(context, "resourcePlugin").getJSONObject("defaults").getInt(key);
    }

    static String resourceRequestKey(Context context, String key) throws Exception {
        return string(context, "resourcePlugin", "requestKeys", key);
    }

    private static JSONObject section(Context context, String sectionName) throws Exception {
        JSONObject section = definitions(context).optJSONObject(sectionName);
        if (section == null) {
            throw new IllegalStateException("Companion bridge contract asset is missing section: " + sectionName);
        }
        return section;
    }

    private static String string(Context context, String sectionName, String objectName, String key) throws Exception {
        JSONObject object = section(context, sectionName).optJSONObject(objectName);
        if (object == null || !object.has(key)) {
            throw new IllegalStateException(
                "Companion bridge contract asset is missing key: " + sectionName + "." + objectName + "." + key
            );
        }
        return object.getString(key);
    }

    private static JSONObject definitions(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, BRIDGE_CONTRACT_ASSET_PATH));
    }
}
