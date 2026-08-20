package com.foliole.android;

import android.content.Context;

final class FolioleCompanionPrimaryDeviceRetirement {
    private static final String LEGACY_PRIMARY_DEVICE_KEY = "primary_device_id";

    private FolioleCompanionPrimaryDeviceRetirement() {}

    static void apply(Context context) throws Exception {
        context.getSharedPreferences(
            FolioleCompanionBridgeContractDefinitions.pairingPreferencesNameStorageKey(context),
            Context.MODE_PRIVATE
        ).edit().remove(LEGACY_PRIMARY_DEVICE_KEY).apply();
    }
}
