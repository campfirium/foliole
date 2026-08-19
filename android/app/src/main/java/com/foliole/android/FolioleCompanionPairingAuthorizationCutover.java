package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

final class FolioleCompanionPairingAuthorizationCutover {
    private FolioleCompanionPairingAuthorizationCutover() {}

    static void ensure(Context context, String requestedAuthorization, String requestedHost,
                       String requestedPlatform) throws Exception {
        SharedPreferences values = context.getSharedPreferences(
            FolioleCompanionBridgeContractDefinitions.pairingPreferencesNameStorageKey(context),
            Context.MODE_PRIVATE);
        if (text(values, FolioleCompanionBridgeContractDefinitions
            .pairingAuthorizationIdPreferenceKey(context)) != null) return;
        String deviceId = text(values, FolioleCompanionBridgeContractDefinitions
            .pairingDeviceIdPreferenceKey(context));
        String encrypted = text(values, FolioleCompanionBridgeContractDefinitions
            .pairingDeviceSecretPreferenceKey(context));
        String iv = text(values, FolioleCompanionBridgeContractDefinitions
            .pairingDeviceSecretIvPreferenceKey(context));
        if (deviceId == null || encrypted == null || iv == null) return;
        String authorization = trim(requestedAuthorization);
        String host = trim(requestedHost);
        String platform = trim(requestedPlatform);
        if (authorization == null) authorization = deviceId;
        if (host == null) host = text(values, FolioleCompanionBridgeContractDefinitions
            .pairingDeviceNamePreferenceKey(context));
        if (platform == null) platform = text(values, FolioleCompanionBridgeContractDefinitions
            .pairingDeviceKindPreferenceKey(context));
        SharedPreferences.Editor editor = values.edit()
            .putString(FolioleCompanionBridgeContractDefinitions
                .pairingAuthorizationIdPreferenceKey(context), authorization)
            .putString(FolioleCompanionBridgeContractDefinitions
                .pairingCredentialSecretPreferenceKey(context), encrypted)
            .putString(FolioleCompanionBridgeContractDefinitions
                .pairingCredentialSecretIvPreferenceKey(context), iv);
        if (host != null) editor.putString(FolioleCompanionBridgeContractDefinitions
            .pairingHostNamePreferenceKey(context), host);
        if (platform != null) editor.putString(FolioleCompanionBridgeContractDefinitions
            .pairingHostPlatformPreferenceKey(context), platform);
        if (!editor.commit()) throw new IllegalStateException(
            "Failed to cut over pairing authorization credentials.");
    }

    private static String text(SharedPreferences values, String key) {
        return trim(values.getString(key, null));
    }

    private static String trim(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        return value.trim();
    }
}
