package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionBridgeContractDefinitions {
    private static final String BRIDGE_CONTRACT_ASSET_PATH = "companion-bridge-contract-definitions.json";

    private FolioleCompanionBridgeContractDefinitions() {}

    static String bootstrapOutputKey(Context context, String key) throws Exception {
        return hostApiString(context, "bootstrap", "outputKeys", key);
    }

    static String bootstrapRuntimeKind(Context context) throws Exception {
        return section(context, "hostApi").getJSONObject("bootstrap").getString("runtimeKind");
    }

    static String networkDiscoveryResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "discoveryResponseKeys", key);
    }

    static String networkRequestKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "requestKeys", key);
    }

    static String networkResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "responseKeys", key);
    }

    static int resourceDefault(Context context, String key) throws Exception {
        return section(context, "resourcePlugin").getJSONObject("defaults").getInt(key);
    }

    static String pairingCredentialRequestKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "credentialRequestKeys", key);
    }

    static String pairingPreferenceKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "preferenceKeys", key);
    }

    static String pairingSignatureHeaderKey(Context context, String key) throws Exception {
        return pairingSignatureString(context, "headerKeys", key);
    }

    static String pairingSignatureRequestKey(Context context, String key) throws Exception {
        return pairingSignatureString(context, "requestKeys", key);
    }

    static String pairingSignatureResponseKey(Context context, String key) throws Exception {
        return pairingSignatureString(context, "responseKeys", key);
    }

    static String pairingStateKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "stateKeys", key);
    }

    static String resourceRequestKey(Context context, String key) throws Exception {
        return string(context, "resourcePlugin", "requestKeys", key);
    }

    static String syncPackTransferRequestKey(Context context, String key) throws Exception {
        return hostApiString(context, "syncPackTransfer", "requestKeys", key);
    }

    static String syncPackTransferResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "syncPackTransfer", "responseKeys", key);
    }

    private static String hostApiString(Context context, String groupName, String objectName, String key) throws Exception {
        JSONObject object = section(context, "hostApi").getJSONObject(groupName).optJSONObject(objectName);
        if (object == null || !object.has(key)) {
            throw new IllegalStateException(
                "Companion bridge contract asset is missing key: hostApi." + groupName + "." + objectName + "." + key
            );
        }
        return object.getString(key);
    }

    private static String pairingSignatureString(Context context, String objectName, String key) throws Exception {
        JSONObject object = section(context, "pairingPlugin").getJSONObject("signature").optJSONObject(objectName);
        if (object == null || !object.has(key)) {
            throw new IllegalStateException(
                "Companion bridge contract asset is missing key: pairingPlugin.signature." + objectName + "." + key
            );
        }
        return object.getString(key);
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
