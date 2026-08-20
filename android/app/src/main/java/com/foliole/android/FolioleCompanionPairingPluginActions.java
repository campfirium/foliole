package com.foliole.android;

import android.content.Context;

import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;

final class FolioleCompanionPairingPluginActions {
    private FolioleCompanionPairingPluginActions() {}

    static void loadPairingState(Context context, PluginCall call) {
        try {
            String authorizationIdKey = FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdCredentialRequestKey(context);
            String credentialSecretKey = FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretCredentialRequestKey(context);
            call.resolve(FolioleCompanionPairingStore.loadPairingState(context));
        } catch (Exception exception) {
            call.reject("Failed to load companion pairing state.", exception);
        }
    }

    static void clearPairingCredentials(Context context, PluginCall call) {
        try {
            FolioleCompanionPairingStore.clearPairingCredentials(context);
            call.resolve(FolioleCompanionPairingStore.loadPairingState(context));
        } catch (Exception exception) {
            call.reject("Failed to clear companion pairing credentials.", exception);
        }
    }

    static void clearSyncGroupCredentials(Context context, PluginCall call) {
        try {
            FolioleCompanionWorkgroupSession.close();
            FolioleCompanionSyncGroupJoinGrantStore.clear(context);
            FolioleCompanionSyncGroupPeerStore.clear(context);
            FolioleCompanionSyncGroupOutboundPeerStore.clear(context);
            context.getSharedPreferences("foliole_workgroup_request_nonces", Context.MODE_PRIVATE).edit().clear().commit();
            context.getSharedPreferences("foliole_workgroup_response_nonces", Context.MODE_PRIVATE).edit().clear().commit();
            call.resolve();
        } catch (Exception exception) {
            call.reject("Failed to clear Sync Group credentials.", exception);
        }
    }

    static void savePairingCredentials(Context context, PluginCall call) {
        try {
            String authorizationIdKey = FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdCredentialRequestKey(context);
            String credentialSecretKey = FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretCredentialRequestKey(context);
            String deviceIdKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceIdCredentialRequestKey(context);
            String deviceKindKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceKindCredentialRequestKey(context);
            String deviceNameKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceNameCredentialRequestKey(context);
            String deviceSecretKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceSecretCredentialRequestKey(context);
            String hostNameKey = FolioleCompanionBridgeContractDefinitions.pairingHostNameCredentialRequestKey(context);
            String hostPlatformKey = FolioleCompanionBridgeContractDefinitions.pairingHostPlatformCredentialRequestKey(context);
            String providerDeviceSecretKey = FolioleCompanionBridgeContractDefinitions
                .pairingCredentialRequestKey(context, "providerDeviceSecret");
            String endpointUrlKey = FolioleCompanionBridgeContractDefinitions.pairingEndpointUrlCredentialRequestKey(context);
            String syncGroupIdKey = FolioleCompanionBridgeContractDefinitions.pairingSyncGroupIdCredentialRequestKey(context);
            String pairedAtKey = FolioleCompanionBridgeContractDefinitions.pairingPairedAtCredentialRequestKey(context);
            String negotiatedVersionKey = FolioleCompanionBridgeContractDefinitions.pairingNegotiatedProtocolVersionCredentialRequestKey(context);
            String remoteProtocolKey = FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolCredentialRequestKey(context);
            String remotePeerIdKey = FolioleCompanionPairingPeerContractDefinitions.remotePeerIdCredentialRequestKey(context);
            String remotePeerNameKey = FolioleCompanionPairingPeerContractDefinitions.remotePeerNameCredentialRequestKey(context);
            String remotePeerPlatformKey = FolioleCompanionPairingPeerContractDefinitions.remotePeerPlatformCredentialRequestKey(context);
            String authorizationId = call.getString(authorizationIdKey);
            String credentialSecret = call.getString(credentialSecretKey);
            String deviceId = call.getString(deviceIdKey);
            String deviceKind = call.getString(deviceKindKey);
            String deviceName = call.getString(deviceNameKey);
            String deviceSecret = call.getString(deviceSecretKey);
            String hostName = call.getString(hostNameKey);
            String hostPlatform = call.getString(hostPlatformKey);
            String providerDeviceSecret = call.getString(providerDeviceSecretKey);
            String endpointUrl = call.getString(endpointUrlKey);
            String syncGroupId = call.getString(syncGroupIdKey);
            String pairedAt = call.getString(pairedAtKey);
            Integer negotiatedVersion = call.getInt(negotiatedVersionKey);
            JSObject remoteProtocol = call.getObject(remoteProtocolKey);
            String remotePeerId = call.getString(remotePeerIdKey);
            String remotePeerName = call.getString(remotePeerNameKey);
            String remotePeerPlatform = call.getString(remotePeerPlatformKey);
            if (
                rejectIfBlank(call, authorizationIdKey, authorizationId) ||
                rejectIfBlank(call, credentialSecretKey, credentialSecret) ||
                rejectIfBlank(call, deviceIdKey, deviceId) ||
                rejectIfBlank(call, deviceKindKey, deviceKind) ||
                rejectIfBlank(call, deviceNameKey, deviceName) ||
                rejectIfBlank(call, deviceSecretKey, deviceSecret) ||
                rejectIfBlank(call, hostNameKey, hostName) ||
                rejectIfBlank(call, hostPlatformKey, hostPlatform) ||
                rejectIfBlank(call, pairedAtKey, pairedAt)
            ) {
                return;
            }
            if (negotiatedVersion == null || remoteProtocol == null) {
                call.reject("Pairing protocol metadata is required.");
                return;
            }
            if ((syncGroupId != null || endpointUrl != null) &&
                (rejectIfBlank(call, syncGroupIdKey, syncGroupId) || rejectIfBlank(call, endpointUrlKey, endpointUrl) ||
                    rejectIfBlank(call, remotePeerIdKey, remotePeerId) ||
                    rejectIfBlank(call, providerDeviceSecretKey, providerDeviceSecret))) return;
            JSObject saved = FolioleCompanionPairingStore.savePairingCredentials(
                context,
                authorizationId,
                credentialSecret,
                deviceId,
                deviceKind,
                deviceName,
                hostName,
                hostPlatform,
                negotiatedVersion,
                pairedAt,
                remotePeerId,
                remotePeerName,
                remotePeerPlatform,
                remoteProtocol
            );
            if (syncGroupId != null || endpointUrl != null) {
                FolioleCompanionSyncGroupOutboundPeerStore.save(
                    context, syncGroupId, authorizationId, deviceId, remotePeerId, remotePeerId, endpointUrl);
            }
            call.resolve(saved);
        } catch (Exception exception) {
            call.reject("Failed to save companion pairing credentials.", exception);
        }
    }

    static void signCompanionSyncRequest(Context context, PluginCall call) {
        try {
            String methodKey = FolioleCompanionPairingSignatureContractDefinitions.methodRequest(context);
            String pathWithQueryKey = FolioleCompanionPairingSignatureContractDefinitions.pathWithQueryRequest(context);
            String timestampKey = FolioleCompanionPairingSignatureContractDefinitions.timestampRequest(context);
            String nonceKey = FolioleCompanionPairingSignatureContractDefinitions.nonceRequest(context);
            String bodyHashKey = FolioleCompanionPairingSignatureContractDefinitions.bodyHashRequest(context);
            String endpointUrlKey = FolioleCompanionPairingSignatureContractDefinitions.endpointUrlRequest(context);
            String syncGroupIdKey = FolioleCompanionPairingSignatureContractDefinitions.syncGroupIdRequest(context);
            String workgroupKeyKey = FolioleCompanionPairingSignatureContractDefinitions.workgroupKeyRequest(context);
            String method = call.getString(methodKey);
            String pathWithQuery = call.getString(pathWithQueryKey);
            String timestamp = call.getString(timestampKey);
            String nonce = call.getString(nonceKey);
            String bodyHash = call.getString(bodyHashKey);
            String endpointUrl = call.getString(endpointUrlKey);
            String syncGroupId = call.getString(syncGroupIdKey);
            String workgroupKey = call.getString(workgroupKeyKey);
            if (
                rejectIfBlank(call, methodKey, method) ||
                rejectIfBlank(call, pathWithQueryKey, pathWithQuery) ||
                rejectIfBlank(call, timestampKey, timestamp) ||
                rejectIfBlank(call, nonceKey, nonce) ||
                rejectIfBlank(call, bodyHashKey, bodyHash)
            ) {
                return;
            }
            if (syncGroupId != null || endpointUrl != null || workgroupKey != null) {
                if (rejectIfBlank(call, syncGroupIdKey, syncGroupId) ||
                    rejectIfBlank(call, endpointUrlKey, endpointUrl) ||
                    rejectIfBlank(call, workgroupKeyKey, workgroupKey)) return;
                call.resolve(FolioleCompanionSyncGroupOutboundPeerStore.signWithWorkgroupKey(
                    context, syncGroupId, endpointUrl, method, pathWithQuery,
                    timestamp, nonce, bodyHash, workgroupKey));
            } else {
                call.resolve(FolioleCompanionPairingStore.signRequest(
                    context, method, pathWithQuery, timestamp, nonce, bodyHash));
            }
        } catch (Exception exception) {
            call.reject("Failed to sign companion sync request.", exception);
        }
    }

    static void bindSyncGroupPeerRoute(Context context, PluginCall call) {
        try {
            String groupKey = routeBindingKey(context, "syncGroupId");
            String localAuthorizationKey = routeBindingKey(context, "localAuthorizationId");
            String localKey = routeBindingKey(context, "localDeviceId");
            String localHostKey = routeBindingKey(context, "localHostName");
            String peerAuthorizationKey = routeBindingKey(context, "peerAuthorizationId");
            String peerKey = routeBindingKey(context, "peerDeviceId");
            String peerHostKey = routeBindingKey(context, "peerHostName");
            String peerPlatformKey = routeBindingKey(context, "peerHostPlatform");
            String endpointKey = routeBindingKey(context, "endpointUrl");
            String groupId = call.getString(groupKey);
            String localAuthorizationId = call.getString(localAuthorizationKey);
            String localDeviceId = call.getString(localKey);
            String localHostName = call.getString(localHostKey);
            String peerAuthorizationId = call.getString(peerAuthorizationKey);
            String peerDeviceId = call.getString(peerKey);
            String peerHostName = call.getString(peerHostKey);
            String peerHostPlatform = call.getString(peerPlatformKey);
            String endpointUrl = call.getString(endpointKey);
            if (rejectIfBlank(call, groupKey, groupId) ||
                rejectIfBlank(call, localAuthorizationKey, localAuthorizationId) ||
                rejectIfBlank(call, localKey, localDeviceId) ||
                rejectIfBlank(call, peerAuthorizationKey, peerAuthorizationId) ||
                rejectIfBlank(call, peerKey, peerDeviceId) ||
                rejectIfBlank(call, localHostKey, localHostName) || rejectIfBlank(call, peerHostKey, peerHostName) ||
                rejectIfBlank(call, peerPlatformKey, peerHostPlatform) ||
                rejectIfBlank(call, endpointKey, endpointUrl)) return;
            FolioleCompanionPairingAuthorizationCutover.ensure(
                context, localAuthorizationId, localHostName, null);
            FolioleCompanionSyncGroupOutboundPeerStore.save(
                context, groupId, localAuthorizationId, localDeviceId, localHostName,
                peerAuthorizationId, peerDeviceId, peerHostName, peerHostPlatform, endpointUrl);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Failed to bind Sync Group peer route.", exception);
        }
    }

    private static boolean rejectIfBlank(PluginCall call, String key, String value) {
        if (value == null || value.trim().isEmpty()) {
            call.reject(key + " is required.");
            return true;
        }
        return false;
    }

    private static String routeBindingKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(
            context, "pairingPlugin", "routeBindingRequestKeys", key);
    }

}
