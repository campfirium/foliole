package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionBridgeContractAsset {
    private static final String ASSET_PATH = "companion-bridge-contract-definitions.json";

    private FolioleCompanionBridgeContractAsset() {}

    static JSONObject hostApiGroup(Context context, String groupName) throws Exception {
        return section(context, "hostApi").getJSONObject(groupName);
    }

    static JSONObject hostApiObject(Context context, String groupName, String objectName) throws Exception {
        JSONObject object = hostApiGroup(context, groupName).optJSONObject(objectName);
        if (object == null) {
            throw new IllegalStateException(
                "Companion bridge contract asset is missing object: hostApi." + groupName + "." + objectName
            );
        }
        return object;
    }

    static int intValue(Context context, String sectionName, String objectName, String key) throws Exception {
        return object(context, sectionName, objectName).getInt(key);
    }

    static String pairingSignatureString(Context context, String objectName, String key) throws Exception {
        JSONObject object = object(context, "pairingPlugin", "signature").optJSONObject(objectName);
        if (object == null) {
            throw new IllegalStateException(
                "Companion bridge contract asset is missing object: pairingPlugin.signature." + objectName
            );
        }
        return object.getString(key);
    }

    static String string(Context context, String sectionName, String objectName, String key) throws Exception {
        JSONObject object = object(context, sectionName, objectName);
        if (!object.has(key)) {
            throw new IllegalStateException(
                "Companion bridge contract asset is missing key: " + sectionName + "." + objectName + "." + key
            );
        }
        return object.getString(key);
    }

    private static JSONObject object(Context context, String sectionName, String objectName) throws Exception {
        JSONObject object = section(context, sectionName).optJSONObject(objectName);
        if (object == null) {
            throw new IllegalStateException(
                "Companion bridge contract asset is missing object: " + sectionName + "." + objectName
            );
        }
        return object;
    }

    private static JSONObject section(Context context, String sectionName) throws Exception {
        JSONObject section = definitions(context).optJSONObject(sectionName);
        if (section == null) {
            throw new IllegalStateException("Companion bridge contract asset is missing section: " + sectionName);
        }
        return section;
    }

    private static JSONObject definitions(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, ASSET_PATH));
    }
}
