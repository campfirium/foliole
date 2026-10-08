package com.foliole.android;

import android.app.Activity;
import android.content.Context;
import com.getcapacitor.JSObject;

/** Native plugin listener dispatch and participation projection. */
final class FolioleCompanionSyncPluginEvents {
    interface Listener { void notify(String name, JSObject event); }
    private FolioleCompanionSyncPluginEvents() {}

    static void dataRequest(Context context, Activity activity, JSObject event, Listener listener) throws Exception {
        String name = FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataRequestEvent(context);
        var bridge = FolioleCompanionSyncGroupDataBridge.current();
        String id = bridge.eventId(event);
        activity.runOnUiThread(() -> { if (bridge.canDispatch(id)) listener.notify(name, event); });
    }

    static void providerState(Context context, Activity activity, boolean lifecycleActive, Listener listener) {
        try {
            String name = FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderStateEvent(context);
            JSObject event = withParticipation(context, lifecycleActive, FolioleCompanionSyncGroupProvider.state());
            activity.runOnUiThread(() -> listener.notify(name, event));
        } catch (Exception error) {
            android.util.Log.w("FolioleSyncProvider", "State dispatch failed", error);
        }
    }

    static JSObject withParticipation(Context context, boolean lifecycleActive, JSObject result) throws Exception {
        JSObject participation = FolioleCompanionSyncParticipationStore.state(context, lifecycleActive);
        for (java.util.Iterator<String> keys = participation.keys(); keys.hasNext();) {
            String key = keys.next();
            result.put(key, participation.get(key));
        }
        return result;
    }
}
