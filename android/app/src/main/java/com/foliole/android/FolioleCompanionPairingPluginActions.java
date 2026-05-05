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
            String deviceId = call.getString("device_id");
            String deviceKind = call.getString("device_kind");
            String deviceName = call.getString("device_name");
            String deviceSecret = call.getString("device_secret");
            String pairedAt = call.getString("paired_at");
            if (
                rejectIfBlank(call, "device_id", deviceId) ||
                rejectIfBlank(call, "device_kind", deviceKind) ||
                rejectIfBlank(call, "device_name", deviceName) ||
                rejectIfBlank(call, "device_secret", deviceSecret) ||
                rejectIfBlank(call, "paired_at", pairedAt)
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
            String method = call.getString("method");
            String pathWithQuery = call.getString("path_with_query");
            String timestamp = call.getString("timestamp");
            String nonce = call.getString("nonce");
            String bodyHash = call.getString("body_hash");
            if (
                rejectIfBlank(call, "method", method) ||
                rejectIfBlank(call, "path_with_query", pathWithQuery) ||
                rejectIfBlank(call, "timestamp", timestamp) ||
                rejectIfBlank(call, "nonce", nonce) ||
                rejectIfBlank(call, "body_hash", bodyHash)
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
