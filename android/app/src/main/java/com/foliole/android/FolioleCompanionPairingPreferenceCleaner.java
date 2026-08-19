package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

final class FolioleCompanionPairingPreferenceCleaner {
    private FolioleCompanionPairingPreferenceCleaner() {}

    static void clear(Context context, SharedPreferences.Editor editor) throws Exception {
        editor.remove(FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretIvPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingDeviceIdPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingDeviceKindPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingDeviceNamePreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingDeviceSecretPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingDeviceSecretIvPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingHostNamePreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingHostPlatformPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingPairedAtPreferenceKey(context))
            .remove(FolioleCompanionBridgeContractDefinitions.pairingPrimaryDeviceIdPreferenceKey(context));
        FolioleCompanionPairingMetadata.clear(context, editor);
        FolioleCompanionPairingProtocolStore.clear(context, editor);
    }
}
