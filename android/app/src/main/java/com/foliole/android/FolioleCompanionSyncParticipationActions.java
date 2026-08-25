package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncParticipationActions {
    private FolioleCompanionSyncParticipationActions() {}

    static JSObject set(Context context, PluginCall call, String name, boolean lifecycleActive) throws Exception {
        String key = FolioleCompanionSyncParticipationContractDefinitions.requestKey(context, name);
        if (!call.getData().has(key)) throw new IllegalArgumentException(key + " is required.");
        boolean value = call.getBoolean(key, false);
        if ("syncEnabled".equals(name)) FolioleCompanionSyncParticipationStore.setSyncEnabled(context, value);
        else FolioleCompanionSyncParticipationStore.setSyncPaused(context, value);
        return FolioleCompanionSyncParticipationStore.state(context, lifecycleActive);
    }

    static JSObject withState(Context context, JSObject result, boolean lifecycleActive) throws Exception {
        JSObject participation = FolioleCompanionSyncParticipationStore.state(context, lifecycleActive);
        for (java.util.Iterator<String> keys = participation.keys(); keys.hasNext();) {
            String key = keys.next();
            result.put(key, participation.get(key));
        }
        return result;
    }
}
