package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionBridgeContractDefinitions {
    private FolioleCompanionBridgeContractDefinitions() {}

    static String pairingCredentialRequestKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "credentialRequestKeys", key);
    }

    static String pairingAuthorizationIdCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "authorizationId");
    }

    static String pairingCredentialSecretCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "credentialSecret");
    }

    static String pairingHostNameCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "hostName");
    }

    static String pairingHostPlatformCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "hostPlatform");
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

    static String pairingNegotiatedProtocolVersionCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "negotiatedProtocolVersion");
    }

    static String pairingRemoteProtocolCredentialRequestKey(Context context) throws Exception {
        return pairingCredentialRequestKey(context, "remoteProtocol");
    }

    static String pairingPreferenceKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "preferenceKeys", key);
    }

    static String pairingLegacyPreferenceKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "legacyPreferenceKeys", key);
    }

    static String pairingDeviceIdPreferenceKey(Context context) throws Exception {
        return pairingLegacyPreferenceKey(context, "deviceId");
    }

    static String pairingAuthorizationIdPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "authorizationId");
    }

    static String pairingCredentialSecretPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "credentialSecret");
    }

    static String pairingCredentialSecretIvPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "credentialSecretIv");
    }

    static String pairingDeviceKindPreferenceKey(Context context) throws Exception {
        return pairingLegacyPreferenceKey(context, "deviceKind");
    }

    static String pairingDeviceNamePreferenceKey(Context context) throws Exception {
        return pairingLegacyPreferenceKey(context, "deviceName");
    }

    static String pairingHostNamePreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "hostName");
    }

    static String pairingHostPlatformPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "hostPlatform");
    }

    static String pairingDeviceSecretPreferenceKey(Context context) throws Exception {
        return pairingLegacyPreferenceKey(context, "deviceSecret");
    }

    static String pairingDeviceSecretIvPreferenceKey(Context context) throws Exception {
        return pairingLegacyPreferenceKey(context, "deviceSecretIv");
    }

    static String pairingPairedAtPreferenceKey(Context context) throws Exception {
        return pairingPreferenceKey(context, "pairedAt");
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

    static String pairingStateKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "pairingPlugin", "stateKeys", key);
    }

    static String pairingAuthorizationIdStateKey(Context context) throws Exception {
        return pairingStateKey(context, "authorizationId");
    }

    static String pairingHostNameStateKey(Context context) throws Exception {
        return pairingStateKey(context, "hostName");
    }

    static String pairingHostPlatformStateKey(Context context) throws Exception {
        return pairingStateKey(context, "hostPlatform");
    }

    static String pairingIsPairedStateKey(Context context) throws Exception {
        return pairingStateKey(context, "isPaired");
    }

    static String pairingPairedAtStateKey(Context context) throws Exception {
        return pairingStateKey(context, "pairedAt");
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
