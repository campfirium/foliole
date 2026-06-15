package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionBridgeContractDefinitions {
    private static final String BRIDGE_CONTRACT_ASSET_PATH = "companion-bridge-contract-definitions.json";

    private FolioleCompanionBridgeContractDefinitions() {}

    static int resourceDefault(Context context, String key) throws Exception {
        return intValue(context, "resourcePlugin", "defaults", key);
    }

    static int resourceExternalDocumentSearchLimitDefault(Context context) throws Exception {
        return resourceDefault(context, "externalDocumentSearchLimit");
    }

    static int resourceMissingResourceLimitDefault(Context context) throws Exception {
        return resourceDefault(context, "missingResourceLimit");
    }

    static int resourcePdfPageTextSearchLimitDefault(Context context) throws Exception {
        return resourceDefault(context, "pdfPageTextSearchLimit");
    }

    static int resourceTopicSearchLimitDefault(Context context) throws Exception {
        return resourceDefault(context, "topicSearchLimit");
    }

    static String pairingCredentialRequestKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "credentialRequestKeys", key);
    }

    static String pairingDeviceIdCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "deviceId");
    }

    static String pairingDeviceKindCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "deviceKind");
    }

    static String pairingDeviceNameCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "deviceName");
    }

    static String pairingDeviceSecretCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "deviceSecret");
    }

    static String pairingPairedAtCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "pairedAt");
    }

    static String pairingPrimaryDeviceIdCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "primaryDeviceId");
    }

    static String pairingPreferenceKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "preferenceKeys", key);
    }

    static String pairingDeviceIdPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "deviceId");
    }

    static String pairingDeviceKindPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "deviceKind");
    }

    static String pairingDeviceNamePreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "deviceName");
    }

    static String pairingDeviceSecretPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "deviceSecret");
    }

    static String pairingDeviceSecretIvPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "deviceSecretIv");
    }

    static String pairingPairedAtPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "pairedAt");
    }

    static String pairingPrimaryDeviceIdPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "primaryDeviceId");
    }

    static String pairingStorageKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "storageKeys", key);
    }

    static String pairingKeyAliasStorageKey(Context context) throws Exception {
        return pairingStorageKey(context, "keyAlias");
    }

    static String pairingPreferencesNameStorageKey(Context context) throws Exception {
        return pairingStorageKey(context, "preferencesName");
    }

    static String pairingSignatureHeaderKey(Context context, String key) throws Exception {
        return pairingSignatureString(context, "headerKeys", key);
    }

    static String pairingDeviceIdSignatureHeaderKey(Context context) throws Exception {
        return pairingSignatureHeaderKey(context, "deviceId");
    }

    static String pairingNonceSignatureHeaderKey(Context context) throws Exception {
        return pairingSignatureHeaderKey(context, "nonce");
    }

    static String pairingSignatureSignatureHeaderKey(Context context) throws Exception {
        return pairingSignatureHeaderKey(context, "signature");
    }

    static String pairingTimestampSignatureHeaderKey(Context context) throws Exception {
        return pairingSignatureHeaderKey(context, "timestamp");
    }

    static String pairingSignatureRequestKey(Context context, String key) throws Exception {
        return pairingSignatureString(context, "requestKeys", key);
    }

    static String pairingBodyHashSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "bodyHash");
    }

    static String pairingMethodSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "method");
    }

    static String pairingNonceSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "nonce");
    }

    static String pairingPathWithQuerySignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "pathWithQuery");
    }

    static String pairingTimestampSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "timestamp");
    }

    static String pairingSignatureResponseKey(Context context, String key) throws Exception {
        return pairingSignatureString(context, "responseKeys", key);
    }

    static String pairingHeadersSignatureResponseKey(Context context) throws Exception {
        return pairingSignatureResponseKey(context, "headers");
    }

    static String pairingStateKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "stateKeys", key);
    }

    static String pairingDeviceIdStateKey(Context context) throws Exception {
        return pairingStateKey(context, "deviceId");
    }

    static String pairingDeviceKindStateKey(Context context) throws Exception {
        return pairingStateKey(context, "deviceKind");
    }

    static String pairingDeviceNameStateKey(Context context) throws Exception {
        return pairingStateKey(context, "deviceName");
    }

    static String pairingIsPairedStateKey(Context context) throws Exception {
        return pairingStateKey(context, "isPaired");
    }

    static String pairingPairedAtStateKey(Context context) throws Exception {
        return pairingStateKey(context, "pairedAt");
    }

    static String pairingPrimaryDeviceIdStateKey(Context context) throws Exception {
        return pairingStateKey(context, "primaryDeviceId");
    }

    static String resourceRequestKey(Context context, String key) throws Exception {
        return string(context, "resourcePlugin", "requestKeys", key);
    }

    static String resourceAttachmentIdRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "attachmentId");
    }

    static String resourceBatchTokenRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "batchToken");
    }

    static String resourceBodyRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "body");
    }

    static String resourceContentHashRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "contentHash");
    }

    static String resourceDocumentIdRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "documentId");
    }

    static String resourceHashRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "hash");
    }

    static String resourceHeadersRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "headers");
    }

    static String resourceLimitRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "limit");
    }

    static String resourceQueryRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "query");
    }

    static String resourceResourcesRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "resources");
    }

    static String resourceUrlRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "url");
    }

    static String hostApiString(Context context, String groupName, String objectName, String key) throws Exception {
        return hostApiObject(context, groupName, objectName).getString(key);
    }

    static String hostApiString(Context context, String groupName, String key) throws Exception {
        return hostApiGroup(context, groupName).getString(key);
    }

    static int hostApiInt(Context context, String groupName, String objectName, String key) throws Exception {
        return hostApiObject(context, groupName, objectName).getInt(key);
    }

    static JSONArray hostApiArray(Context context, String groupName, String objectName, String key) throws Exception {
        return hostApiObject(context, groupName, objectName).getJSONArray(key);
    }

    static JSONObject hostApiGroup(Context context, String groupName) throws Exception {
        return section(context, "hostApi").getJSONObject(groupName);
    }

    private static JSONObject hostApiObject(Context context, String groupName, String objectName) throws Exception {
        JSONObject object = hostApiGroup(context, groupName).optJSONObject(objectName);
        if (object == null) {
            throw new IllegalStateException("Companion bridge contract asset is missing object: hostApi." + groupName + "." + objectName);
        }
        return object;
    }

    private static String pairingSignatureString(Context context, String objectName, String key) throws Exception {
        return pairingSignatureObject(context, objectName).getString(key);
    }

    private static JSONObject pairingSignatureObject(Context context, String objectName) throws Exception {
        JSONObject object = object(context, "pairingPlugin", "signature").optJSONObject(objectName);
        if (object == null) {
            throw new IllegalStateException("Companion bridge contract asset is missing object: pairingPlugin.signature." + objectName);
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

    private static String string(Context context, String sectionName, String objectName, String key) throws Exception {
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
            throw new IllegalStateException("Companion bridge contract asset is missing object: " + sectionName + "." + objectName);
        }
        return object;
    }

    private static int intValue(Context context, String sectionName, String objectName, String key) throws Exception {
        return object(context, sectionName, objectName).getInt(key);
    }

    private static JSONObject definitions(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, BRIDGE_CONTRACT_ASSET_PATH));
    }
}
