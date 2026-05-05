package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionBridgeContractDefinitions {
    private static final String BRIDGE_CONTRACT_ASSET_PATH = "companion-bridge-contract-definitions.json";

    private FolioleCompanionBridgeContractDefinitions() {}

    static String bootstrapOutputKey(Context context, String key) throws Exception {
        return hostApiString(context, "bootstrap", "outputKeys", key);
    }

    static String bootstrapBootedAtOutputKey(Context context) throws Exception {
        return bootstrapOutputKey(context, "bootedAt");
    }

    static String bootstrapDatabasePathOutputKey(Context context) throws Exception {
        return bootstrapOutputKey(context, "databasePath");
    }

    static String bootstrapDatabaseReadyOutputKey(Context context) throws Exception {
        return bootstrapOutputKey(context, "databaseReady");
    }

    static String bootstrapDeviceIdOutputKey(Context context) throws Exception {
        return bootstrapOutputKey(context, "deviceId");
    }

    static String bootstrapDeviceNameOutputKey(Context context) throws Exception {
        return bootstrapOutputKey(context, "deviceName");
    }

    static String bootstrapRuntimeKindOutputKey(Context context) throws Exception {
        return bootstrapOutputKey(context, "runtimeKind");
    }

    static String bootstrapRuntimeKind(Context context) throws Exception {
        return section(context, "hostApi").getJSONObject("bootstrap").getString("runtimeKind");
    }

    static String networkDiscoveryResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "discoveryResponseKeys", key);
    }

    static String networkEndpointUrlsResponseKey(Context context) throws Exception {
        return networkDiscoveryResponseKey(context, "endpointUrls");
    }

    static String networkRequestKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "requestKeys", key);
    }

    static String networkBodyRequestKey(Context context) throws Exception {
        return networkRequestKey(context, "body");
    }

    static String networkHeadersRequestKey(Context context) throws Exception {
        return networkRequestKey(context, "headers");
    }

    static String networkMethodRequestKey(Context context) throws Exception {
        return networkRequestKey(context, "method");
    }

    static String networkUrlRequestKey(Context context) throws Exception {
        return networkRequestKey(context, "url");
    }

    static String networkResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "responseKeys", key);
    }

    static String networkBodyResponseKey(Context context) throws Exception {
        return networkResponseKey(context, "body");
    }

    static String networkStatusResponseKey(Context context) throws Exception {
        return networkResponseKey(context, "status");
    }

    static int resourceDefault(Context context, String key) throws Exception {
        return section(context, "resourcePlugin").getJSONObject("defaults").getInt(key);
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

    static String pairingPreferenceKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "preferenceKeys", key);
    }

    static String pairingSignatureHeaderKey(Context context, String key) throws Exception {
        return pairingSignatureString(context, "headerKeys", key);
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

    static String pairingStateKey(Context context, String key) throws Exception {
        return string(context, "pairingPlugin", "stateKeys", key);
    }

    static String resourceRequestKey(Context context, String key) throws Exception {
        return string(context, "resourcePlugin", "requestKeys", key);
    }

    static String resourceAttachmentIdRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "attachmentId");
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

    static String syncPackTransferRequestKey(Context context, String key) throws Exception {
        return hostApiString(context, "syncPackTransfer", "requestKeys", key);
    }

    static String syncPackTransferHeadersRequestKey(Context context) throws Exception {
        return syncPackTransferRequestKey(context, "headers");
    }

    static String syncPackTransferPackPathRequestKey(Context context) throws Exception {
        return syncPackTransferRequestKey(context, "packPath");
    }

    static String syncPackTransferUrlRequestKey(Context context) throws Exception {
        return syncPackTransferRequestKey(context, "url");
    }

    static String syncPackTransferResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "syncPackTransfer", "responseKeys", key);
    }

    static String syncPackTransferDeletedResponseKey(Context context) throws Exception {
        return syncPackTransferResponseKey(context, "deleted");
    }

    static String syncPackTransferPackPathResponseKey(Context context) throws Exception {
        return syncPackTransferResponseKey(context, "packPath");
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
