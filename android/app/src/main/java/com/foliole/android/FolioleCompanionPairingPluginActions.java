package com.foliole.android;

import android.content.Context;

import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;

final class FolioleCompanionPairingPluginActions {
    private FolioleCompanionPairingPluginActions() {}

    static void loadPairingState(Context context, PluginCall call) {
        try {
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
            FolioleCompanionPairingStore.clearPairingCredentials(context);
            FolioleCompanionSyncGroupJoinGrantStore.clear(context);
            FolioleCompanionSyncGroupPeerStore.clear(context);
            FolioleCompanionSyncGroupOutboundPeerStore.clear(context);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Failed to clear Sync Group credentials.", exception);
        }
    }

    static void savePairingCredentials(Context context, PluginCall call) {
        try {
            String deviceIdKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceIdCredentialRequestKey(context);
            String deviceKindKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceKindCredentialRequestKey(context);
            String deviceNameKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceNameCredentialRequestKey(context);
            String deviceSecretKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceSecretCredentialRequestKey(context);
            String providerDeviceSecretKey = FolioleCompanionBridgeContractDefinitions
                .pairingCredentialRequestKey(context, "providerDeviceSecret");
            String endpointUrlKey = FolioleCompanionBridgeContractDefinitions.pairingEndpointUrlCredentialRequestKey(context);
            String syncGroupIdKey = FolioleCompanionBridgeContractDefinitions.pairingSyncGroupIdCredentialRequestKey(context);
            String pairedAtKey = FolioleCompanionBridgeContractDefinitions.pairingPairedAtCredentialRequestKey(context);
            String primaryDeviceIdKey = FolioleCompanionBridgeContractDefinitions.pairingPrimaryDeviceIdCredentialRequestKey(context);
            String negotiatedVersionKey = FolioleCompanionBridgeContractDefinitions.pairingNegotiatedProtocolVersionCredentialRequestKey(context);
            String remoteProtocolKey = FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolCredentialRequestKey(context);
            String remotePeerIdKey = FolioleCompanionPairingPeerContractDefinitions.remotePeerIdCredentialRequestKey(context);
            String remotePeerNameKey = FolioleCompanionPairingPeerContractDefinitions.remotePeerNameCredentialRequestKey(context);
            String remotePeerPlatformKey = FolioleCompanionPairingPeerContractDefinitions.remotePeerPlatformCredentialRequestKey(context);
            String deviceId = call.getString(deviceIdKey);
            String deviceKind = call.getString(deviceKindKey);
            String deviceName = call.getString(deviceNameKey);
            String deviceSecret = call.getString(deviceSecretKey);
            String providerDeviceSecret = call.getString(providerDeviceSecretKey);
            String endpointUrl = call.getString(endpointUrlKey);
            String syncGroupId = call.getString(syncGroupIdKey);
            String pairedAt = call.getString(pairedAtKey);
            String primaryDeviceId = call.getString(primaryDeviceIdKey);
            Integer negotiatedVersion = call.getInt(negotiatedVersionKey);
            JSObject remoteProtocol = call.getObject(remoteProtocolKey);
            String remotePeerId = call.getString(remotePeerIdKey);
            String remotePeerName = call.getString(remotePeerNameKey);
            String remotePeerPlatform = call.getString(remotePeerPlatformKey);
            if (
                rejectIfBlank(call, deviceIdKey, deviceId) ||
                rejectIfBlank(call, deviceKindKey, deviceKind) ||
                rejectIfBlank(call, deviceNameKey, deviceName) ||
                rejectIfBlank(call, deviceSecretKey, deviceSecret) ||
                rejectIfBlank(call, pairedAtKey, pairedAt) ||
                rejectIfBlank(call, primaryDeviceIdKey, primaryDeviceId)
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
                deviceId,
                deviceKind,
                deviceName,
                deviceSecret,
                negotiatedVersion,
                pairedAt,
                primaryDeviceId,
                remotePeerId,
                remotePeerName,
                remotePeerPlatform,
                remoteProtocol
            );
            if (syncGroupId != null || endpointUrl != null) {
                FolioleCompanionSyncGroupOutboundPeerStore.save(
                    context, syncGroupId, deviceId, remotePeerId, endpointUrl, deviceSecret);
                FolioleCompanionSyncGroupPeerStore.saveSecret(context, primaryDeviceId, providerDeviceSecret);
            }
            call.resolve(saved);
        } catch (Exception exception) {
            call.reject("Failed to save companion pairing credentials.", exception);
        }
    }

    static void signCompanionSyncRequest(Context context, PluginCall call) {
        try {
            String methodKey = FolioleCompanionBridgeContractDefinitions.pairingMethodSignatureRequestKey(context);
            String pathWithQueryKey = FolioleCompanionBridgeContractDefinitions.pairingPathWithQuerySignatureRequestKey(context);
            String timestampKey = FolioleCompanionBridgeContractDefinitions.pairingTimestampSignatureRequestKey(context);
            String nonceKey = FolioleCompanionBridgeContractDefinitions.pairingNonceSignatureRequestKey(context);
            String bodyHashKey = FolioleCompanionBridgeContractDefinitions.pairingBodyHashSignatureRequestKey(context);
            String endpointUrlKey = FolioleCompanionBridgeContractDefinitions.pairingEndpointUrlSignatureRequestKey(context);
            String syncGroupIdKey = FolioleCompanionBridgeContractDefinitions.pairingSyncGroupIdSignatureRequestKey(context);
            String method = call.getString(methodKey);
            String pathWithQuery = call.getString(pathWithQueryKey);
            String timestamp = call.getString(timestampKey);
            String nonce = call.getString(nonceKey);
            String bodyHash = call.getString(bodyHashKey);
            String endpointUrl = call.getString(endpointUrlKey);
            String syncGroupId = call.getString(syncGroupIdKey);
            if (
                rejectIfBlank(call, methodKey, method) ||
                rejectIfBlank(call, pathWithQueryKey, pathWithQuery) ||
                rejectIfBlank(call, timestampKey, timestamp) ||
                rejectIfBlank(call, nonceKey, nonce) ||
                rejectIfBlank(call, bodyHashKey, bodyHash)
            ) {
                return;
            }
            if (syncGroupId != null || endpointUrl != null) {
                if (rejectIfBlank(call, syncGroupIdKey, syncGroupId) || rejectIfBlank(call, endpointUrlKey, endpointUrl)) return;
                call.resolve(FolioleCompanionSyncGroupOutboundPeerStore.sign(
                    context, syncGroupId, endpointUrl, method, pathWithQuery, timestamp, nonce, bodyHash));
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
            String peerKey = routeBindingKey(context, "peerDeviceId");
            String endpointKey = routeBindingKey(context, "endpointUrl");
            String groupId = call.getString(groupKey);
            String peerDeviceId = call.getString(peerKey);
            String endpointUrl = call.getString(endpointKey);
            if (rejectIfBlank(call, groupKey, groupId) || rejectIfBlank(call, peerKey, peerDeviceId) ||
                rejectIfBlank(call, endpointKey, endpointUrl)) return;
            FolioleCompanionSyncGroupOutboundPeerStore.bindRoute(
                context, groupId, peerDeviceId, endpointUrl);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Failed to bind Sync Group peer route.", exception);
        }
    }

    static void savePrimaryDeviceId(Context context, PluginCall call) {
        try {
            String primaryDeviceIdKey = FolioleCompanionBridgeContractDefinitions.pairingPrimaryDeviceIdCredentialRequestKey(context);
            String primaryDeviceId = call.getString(primaryDeviceIdKey);
            if (rejectIfBlank(call, primaryDeviceIdKey, primaryDeviceId)) {
                return;
            }
            call.resolve(FolioleCompanionPairingStore.savePrimaryDeviceId(context, primaryDeviceId));
        } catch (Exception exception) {
            call.reject("Failed to save companion primary device id.", exception);
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
