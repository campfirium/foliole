package com.foliole.android;

import android.content.Context;

final class FolioleCompanionHostBridgeContractDefinitions {
    private FolioleCompanionHostBridgeContractDefinitions() {}

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
        return FolioleCompanionBridgeContractDefinitions.hostApiGroup(context, "bootstrap").getString("runtimeKind");
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

    static String networkBodyResponseKey(Context context) throws Exception {
        return networkResponseKey(context, "body");
    }

    static String networkEndpointUrlsResponseKey(Context context) throws Exception {
        return networkDiscoveryResponseKey(context, "endpointUrls");
    }

    static String networkEmulatorHost(Context context) throws Exception {
        return networkDiscoveryDefault(context, "emulatorHost");
    }

    static String networkEndpointUrl(Context context, String hostAddress) throws Exception {
        return networkEndpointUrl(context, hostAddress, networkPort(context));
    }

    static String networkEndpointUrl(Context context, String hostAddress, int port) throws Exception {
        return networkDiscoveryDefault(context, "endpointTemplate")
            .replace(networkDiscoveryDefault(context, "hostToken"), hostAddress)
            .replace(networkDiscoveryDefault(context, "portToken"), String.valueOf(port));
    }

    static int networkPort(Context context) throws Exception {
        return networkDiscoveryDefaultInt(context, "port");
    }

    static String networkServiceType(Context context) throws Exception {
        return networkDiscoveryDefault(context, "serviceType");
    }

    static int networkDiscoveryTimeoutMs(Context context) throws Exception {
        return networkDiscoveryDefaultInt(context, "timeoutMs");
    }

    static String networkStatusResponseKey(Context context) throws Exception {
        return networkResponseKey(context, "status");
    }

    static String syncPackTransferDeletedResponseKey(Context context) throws Exception {
        return syncPackTransferResponseKey(context, "deleted");
    }

    static String syncPackTransferHeadersRequestKey(Context context) throws Exception {
        return syncPackTransferRequestKey(context, "headers");
    }

    static String syncPackTransferPackPathRequestKey(Context context) throws Exception {
        return syncPackTransferRequestKey(context, "packPath");
    }

    static String syncPackTransferPackPathResponseKey(Context context) throws Exception {
        return syncPackTransferResponseKey(context, "packPath");
    }

    static String syncPackTransferUrlRequestKey(Context context) throws Exception {
        return syncPackTransferRequestKey(context, "url");
    }

    static String workspaceSyncEndpointUrlRequestKey(Context context) throws Exception {
        return workspaceSyncRequestKey(context, "endpointUrl");
    }

    static String workspaceSyncMessageRequestKey(Context context) throws Exception {
        return workspaceSyncRequestKey(context, "message");
    }

    static String workspaceSyncOccurredAtRequestKey(Context context) throws Exception {
        return workspaceSyncRequestKey(context, "occurredAt");
    }

    static String workspaceSyncStatusRequestKey(Context context) throws Exception {
        return workspaceSyncRequestKey(context, "status");
    }

    private static String bootstrapOutputKey(Context context, String key) throws Exception {
        return hostApiString(context, "bootstrap", "outputKeys", key);
    }

    private static String hostApiString(Context context, String groupName, String objectName, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.hostApiString(context, groupName, objectName, key);
    }

    private static String networkDiscoveryResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "discoveryResponseKeys", key);
    }

    private static String networkDiscoveryDefault(Context context, String key) throws Exception {
        return hostApiString(context, "network", "discoveryDefaults", key);
    }

    private static int networkDiscoveryDefaultInt(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.hostApiGroup(context, "network")
            .getJSONObject("discoveryDefaults")
            .getInt(key);
    }

    private static String networkRequestKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "requestKeys", key);
    }

    private static String networkResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "network", "responseKeys", key);
    }

    private static String syncPackTransferRequestKey(Context context, String key) throws Exception {
        return hostApiString(context, "syncPackTransfer", "requestKeys", key);
    }

    private static String syncPackTransferResponseKey(Context context, String key) throws Exception {
        return hostApiString(context, "syncPackTransfer", "responseKeys", key);
    }

    private static String workspaceSyncRequestKey(Context context, String key) throws Exception {
        return hostApiString(context, "workspaceSync", "requestKeys", key);
    }
}
