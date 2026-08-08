package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionBridgeContractDefinitions {
    private FolioleCompanionBridgeContractDefinitions() {}

    static int resourceDefault(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.intValue(context, "resourcePlugin", "defaults", key);
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
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "credentialRequestKeys", key);
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

    static String pairingEndpointUrlCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "endpointUrl");
    }

    static String pairingSyncGroupIdCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "syncGroupId");
    }

    static String pairingPairedAtCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "pairedAt");
    }

    static String pairingPrimaryDeviceIdCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "primaryDeviceId");
    }

    static String pairingNegotiatedProtocolVersionCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "negotiatedProtocolVersion");
    }

    static String pairingRemoteProtocolCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "remoteProtocol");
    }

    static String pairingPreferenceKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "preferenceKeys", key);
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

    static String pairingNegotiatedProtocolVersionPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "negotiatedProtocolVersion");
    }

    static String pairingRemoteProtocolPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "remoteProtocol");
    }

    static String pairingStorageKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "storageKeys", key);
    }

    static String pairingKeyAliasStorageKey(Context context) throws Exception {
        return pairingStorageKey(context, "keyAlias");
    }

    static String pairingPreferencesNameStorageKey(Context context) throws Exception {
        return pairingStorageKey(context, "preferencesName");
    }

    static String pairingSignatureHeaderKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.pairingSignatureString(context, "headerKeys", key);
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
        return FolioleCompanionBridgeContractAsset.pairingSignatureString(context, "requestKeys", key);
    }

    static String pairingBodyHashSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "bodyHash");
    }

    static String pairingEndpointUrlSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "endpointUrl");
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

    static String pairingSyncGroupIdSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "syncGroupId");
    }

    static String pairingTimestampSignatureRequestKey(Context context) throws Exception {
        return pairingSignatureRequestKey(context, "timestamp");
    }

    static String pairingSignatureResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.pairingSignatureString(context, "responseKeys", key);
    }

    static String pairingHeadersSignatureResponseKey(Context context) throws Exception {
        return pairingSignatureResponseKey(context, "headers");
    }

    static String pairingStateKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "stateKeys", key);
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

    static String pairingNegotiatedProtocolVersionStateKey(Context context) throws Exception {
        return pairingStateKey(context, "negotiatedProtocolVersion");
    }

    static String pairingRemoteProtocolStateKey(Context context) throws Exception {
        return pairingStateKey(context, "remoteProtocol");
    }

    static String pairingRepairRequiredStateKey(Context context) throws Exception {
        return pairingStateKey(context, "repairRequired");
    }

    static String pairingSyncUsableStateKey(Context context) throws Exception {
        return pairingStateKey(context, "syncUsable");
    }

    static String resourceRequestKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "resourcePlugin", "requestKeys", key);
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

    static String resourceCommittedRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "committed");
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

    static String resourceMimeTypeRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "mimeType");
    }

    static String resourceQueryRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "query");
    }

    static String resourceResourcesRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "resources");
    }

    static String resourceStorageKeyRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "storageKey");
    }

    static String resourceUrlRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "url");
    }

    static String hostApiString(Context context, String groupName, String objectName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiObject(context, groupName, objectName).getString(key);
    }

    static String hostApiString(Context context, String groupName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiGroup(context, groupName).getString(key);
    }

    static int hostApiInt(Context context, String groupName, String objectName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiObject(context, groupName, objectName).getInt(key);
    }

    static JSONArray hostApiArray(Context context, String groupName, String objectName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiObject(context, groupName, objectName).getJSONArray(key);
    }

    static JSONObject hostApiGroup(Context context, String groupName) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiGroup(context, groupName);
    }
}
