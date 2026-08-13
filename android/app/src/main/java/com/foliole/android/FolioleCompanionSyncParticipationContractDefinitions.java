package com.foliole.android;

import android.content.Context;

final class FolioleCompanionSyncParticipationContractDefinitions {
    private FolioleCompanionSyncParticipationContractDefinitions() {}

    static boolean defaultValue(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiObject(context, "syncParticipation", "defaults")
            .getBoolean(key);
    }

    static String requestKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset
            .hostApiObject(context, "syncParticipation", "requestKeys").getString(key);
    }

    static String stateKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset
            .hostApiObject(context, "syncParticipation", "stateKeys").getString(key);
    }

    static String preferencesName(Context context) throws Exception {
        return FolioleCompanionBridgeContractAsset
            .hostApiObject(context, "syncParticipation", "storage").getString("preferencesName");
    }
}
