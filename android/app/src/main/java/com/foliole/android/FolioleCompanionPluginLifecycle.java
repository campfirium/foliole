package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionPluginLifecycle {
    private final Context context;
    private final FolioleCompanionSyncPlugin plugin;
    private FolioleCompanionNsdMonitor monitor;
    private boolean active = true;

    FolioleCompanionPluginLifecycle(
        Context context,
        FolioleCompanionSyncPlugin plugin,
        FolioleCompanionNsdMonitor.HintListener hintListener
    ) {
        this.context = context.getApplicationContext();
        this.plugin = plugin;
        try {
            monitor = new FolioleCompanionNsdMonitor(this.context, hintListener);
            reconcileMonitor();
        } catch (Exception error) {
            android.util.Log.w("FolioleSyncDiscovery", "Monitor unavailable", error);
        }
    }

    boolean isParticipating() throws Exception {
        return FolioleCompanionSyncParticipationStore.isParticipating(context, active);
    }

    JSObject state() throws Exception {
        return FolioleCompanionSyncParticipationStore.state(context, active);
    }

    JSObject set(PluginCall call, String name) throws Exception {
        JSObject result = FolioleCompanionSyncParticipationActions.set(context, call, name, active);
        reconcileMonitor();
        reconcileProvider();
        return result;
    }

    JSObject withState(JSObject result) throws Exception {
        return FolioleCompanionSyncParticipationActions.withState(context, result, active);
    }

    void pause() {
        active = false;
        if (monitor != null) monitor.stop();
        FolioleCompanionSyncGroupProvider.pause(plugin);
    }

    void resume() throws Exception {
        active = true;
        reconcileMonitor();
    }

    private void reconcileMonitor() throws Exception {
        if (monitor == null) return;
        if (isParticipating()) monitor.start();
        else monitor.stop();
    }

    void reconcileProvider() throws Exception {
        FolioleCompanionSyncGroupProvider.reconcile(plugin, plugin.getActivity(), isParticipating());
    }
}
