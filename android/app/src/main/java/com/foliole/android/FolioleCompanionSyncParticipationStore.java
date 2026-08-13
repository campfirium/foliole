package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;

final class FolioleCompanionSyncParticipationStore {
    private FolioleCompanionSyncParticipationStore() {}

    static boolean isParticipating(Context context, boolean lifecycleActive) throws Exception {
        return lifecycleActive && syncEnabled(context) && !syncPaused(context);
    }

    static JSObject state(Context context, boolean lifecycleActive) throws Exception {
        boolean enabled = syncEnabled(context);
        boolean paused = syncPaused(context);
        JSObject result = new JSObject();
        result.put(stateKey(context, "lifecycleActive"), lifecycleActive);
        result.put(stateKey(context, "participating"), lifecycleActive && enabled && !paused);
        result.put(stateKey(context, "syncEnabled"), enabled);
        result.put(stateKey(context, "syncPaused"), paused);
        return result;
    }

    static void setSyncEnabled(Context context, boolean enabled) throws Exception {
        preferences(context).edit().putBoolean(requestKey(context, "syncEnabled"), enabled).apply();
    }

    static void setSyncPaused(Context context, boolean paused) throws Exception {
        preferences(context).edit().putBoolean(requestKey(context, "syncPaused"), paused).apply();
    }

    private static boolean syncEnabled(Context context) throws Exception {
        return preferences(context).getBoolean(
            requestKey(context, "syncEnabled"), defaultValue(context, "syncEnabled")
        );
    }

    private static boolean syncPaused(Context context) throws Exception {
        return preferences(context).getBoolean(
            requestKey(context, "syncPaused"), defaultValue(context, "syncPaused")
        );
    }

    private static SharedPreferences preferences(Context context) throws Exception {
        return context.getSharedPreferences(
            FolioleCompanionSyncParticipationContractDefinitions.preferencesName(context),
            Context.MODE_PRIVATE
        );
    }

    private static boolean defaultValue(Context context, String key) throws Exception {
        return FolioleCompanionSyncParticipationContractDefinitions.defaultValue(context, key);
    }

    private static String requestKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncParticipationContractDefinitions.requestKey(context, key);
    }

    private static String stateKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncParticipationContractDefinitions.stateKey(context, key);
    }
}
