package com.foliole.android;

import android.content.Context;

import com.getcapacitor.PluginCall;

final class FolioleCompanionPairingPluginActions {
    private FolioleCompanionPairingPluginActions() {}

    static void loadPairingState(Context context, PluginCall call) {
        try {
            call.resolve(FolioleCompanionPairingStore.loadPairingState(context));
        } catch (Exception exception) {
            call.reject("Failed to load companion pairing state.", exception);
        }
    }

    static void savePairingCredentials(Context context, PluginCall call) {
        try {
            String deviceIdKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceIdCredentialRequestKey(context);
            String deviceKindKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceKindCredentialRequestKey(context);
            String deviceNameKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceNameCredentialRequestKey(context);
            String deviceSecretKey = FolioleCompanionBridgeContractDefinitions.pairingDeviceSecretCredentialRequestKey(context);
            String pairedAtKey = FolioleCompanionBridgeContractDefinitions.pairingPairedAtCredentialRequestKey(context);
            String deviceId = call.getString(deviceIdKey);
            String deviceKind = call.getString(deviceKindKey);
            String deviceName = call.getString(deviceNameKey);
            String deviceSecret = call.getString(deviceSecretKey);
            String pairedAt = call.getString(pairedAtKey);
            if (
                rejectIfBlank(call, deviceIdKey, deviceId) ||
                rejectIfBlank(call, deviceKindKey, deviceKind) ||
                rejectIfBlank(call, deviceNameKey, deviceName) ||
                rejectIfBlank(call, deviceSecretKey, deviceSecret) ||
                rejectIfBlank(call, pairedAtKey, pairedAt)
            ) {
                return;
            }
            call.resolve(FolioleCompanionPairingStore.savePairingCredentials(
                context,
                deviceId,
                deviceKind,
                deviceName,
                deviceSecret,
                pairedAt
            ));
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
            String method = call.getString(methodKey);
            String pathWithQuery = call.getString(pathWithQueryKey);
            String timestamp = call.getString(timestampKey);
            String nonce = call.getString(nonceKey);
            String bodyHash = call.getString(bodyHashKey);
            if (
                rejectIfBlank(call, methodKey, method) ||
                rejectIfBlank(call, pathWithQueryKey, pathWithQuery) ||
                rejectIfBlank(call, timestampKey, timestamp) ||
                rejectIfBlank(call, nonceKey, nonce) ||
                rejectIfBlank(call, bodyHashKey, bodyHash)
            ) {
                return;
            }
            call.resolve(FolioleCompanionPairingStore.signRequest(
                context,
                method,
                pathWithQuery,
                timestamp,
                nonce,
                bodyHash
            ));
        } catch (Exception exception) {
            call.reject("Failed to sign companion sync request.", exception);
        }
    }

    private static boolean rejectIfBlank(PluginCall call, String key, String value) {
        if (value == null || value.trim().isEmpty()) {
            call.reject(key + " is required.");
            return true;
        }
        return false;
    }

}
