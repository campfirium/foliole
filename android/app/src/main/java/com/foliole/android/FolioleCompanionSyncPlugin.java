package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends Plugin {
    private FolioleCompanionNsdDiscoverySession discoverySession;
    private final ExecutorService fileExecutor = Executors.newSingleThreadExecutor();
    private boolean lifecycleActive = true;
    private FolioleCompanionNsdMonitor serviceMonitor;

    @Override public void load() {
        super.load();
        try {
            FolioleCompanionSyncGroupDataBridge.install(getContext(), this, this::dispatchDataRequest);
            serviceMonitor = new FolioleCompanionNsdMonitor(getContext(), this::dispatchServiceHint);
            reconcileServiceMonitor();
        } catch (Exception error) {
            android.util.Log.w("FolioleSyncDiscovery", "Monitor unavailable", error);
        }
    }

    @PluginMethod public void desktopHttpRequest(PluginCall call) {
        FolioleCompanionNetworkPluginActions.desktopHttpRequest(getContext(), call);
    }

    @PluginMethod public void loadDiscoveryCandidates(PluginCall call) {
        try {
            FolioleCompanionNetworkPluginActions.loadDiscoveryCandidates(getContext(), call);
        } catch (Exception error) {
            call.reject(FolioleCompanionPluginErrors.withCause("Failed to load Sync Group candidates.", error), error);
        }
    }

    @PluginMethod public void startDiscoverySession(PluginCall call) {
        try {
            if (discoverySession == null) discoverySession = new FolioleCompanionNsdDiscoverySession(
                getContext(), event -> getActivity().runOnUiThread(() -> notifyListeners("syncGroupDiscoveryChanged", event)));
            call.resolve(discoverySession.start());
        } catch (Exception error) { call.reject("Sync Group discovery is unavailable.", error); }
    }

    @PluginMethod public void stopDiscoverySession(PluginCall call) {
        call.resolve(discoverySession == null ? new JSObject() : discoverySession.stop());
    }

    @PluginMethod public void startSyncGroupProvider(PluginCall call) {
        async(call, "Failed to start Sync Group provider.", () ->
            FolioleCompanionSyncGroupProvider.start(
                getContext(), getActivity(), call, this, this::dispatchDataRequest,
                this::dispatchProviderState, isParticipating()
            ));
    }

    @PluginMethod public void stopSyncGroupProvider(PluginCall call) {
        async(call, "Failed to stop Sync Group provider.", () ->
            withParticipation(FolioleCompanionSyncGroupProvider.stop(this)));
    }

    @PluginMethod public void loadSyncGroupProviderState(PluginCall call) {
        try { call.resolve(withParticipation(FolioleCompanionSyncGroupProvider.state())); }
        catch (Exception error) { call.reject("Failed to load Sync participation state.", error); }
    }

    @PluginMethod public void loadSyncParticipationState(PluginCall call) {
        try { call.resolve(FolioleCompanionSyncParticipationStore.state(getContext(), lifecycleActive)); }
        catch (Exception error) { call.reject("Failed to load Sync participation state.", error); }
    }

    @PluginMethod public void setSyncEnabled(PluginCall call) {
        setParticipation(call, "syncEnabled");
    }

    @PluginMethod public void setSyncPaused(PluginCall call) {
        setParticipation(call, "syncPaused");
    }

    @PluginMethod public void approveSyncGroupJoinRequest(PluginCall call) {
        async(call, "Failed to approve Device.", () ->
            withParticipation(FolioleCompanionSyncGroupProvider.approve(getContext(), call)));
    }

    @PluginMethod public void rejectSyncGroupJoinRequest(PluginCall call) {
        async(call, "Failed to reject Device.", () ->
            withParticipation(FolioleCompanionSyncGroupProvider.reject(getContext(), call)));
    }

    @PluginMethod public void resolveSyncGroupDataRequest(PluginCall call) {
        try {
            FolioleCompanionSyncGroupDataBridge.current().resolve(call.getData());
            call.resolve();
        } catch (Exception error) {
            call.reject(FolioleCompanionPluginErrors.withCause("Failed to resolve Sync Group data request.", error), error);
        }
    }

    @PluginMethod public void loadPairingState(PluginCall call) {
        FolioleCompanionPairingPluginActions.loadPairingState(getContext(), call);
    }

    @PluginMethod public void clearPairingCredentials(PluginCall call) {
        FolioleCompanionPairingPluginActions.clearPairingCredentials(getContext(), call);
    }

    @PluginMethod public void clearSyncGroupCredentials(PluginCall call) {
        FolioleCompanionPairingPluginActions.clearSyncGroupCredentials(getContext(), call);
    }

    @PluginMethod public void bindSyncGroupPeerRoute(PluginCall call) {
        FolioleCompanionPairingPluginActions.bindSyncGroupPeerRoute(getContext(), call);
    }

    @PluginMethod public void savePairingCredentials(PluginCall call) {
        FolioleCompanionPairingPluginActions.savePairingCredentials(getContext(), call);
    }

    @PluginMethod public void signCompanionSyncRequest(PluginCall call) {
        fileExecutor.execute(() ->
            FolioleCompanionPairingPluginActions.signCompanionSyncRequest(getContext(), call));
    }

    @PluginMethod public void downloadAttachmentResourceBatch(PluginCall call) {
        async(call, "Failed to download companion attachment resources.", () ->
            FolioleCompanionResourcePluginActions.downloadAttachmentResourceBatch(getContext(), call));
    }

    @PluginMethod public void stageAttachmentResourceBatch(PluginCall call) {
        async(call, "Failed to stage companion attachment resources.", () ->
            FolioleCompanionResourcePluginActions.stageAttachmentResourceBatch(getContext(), call));
    }

    @PluginMethod public void finishAttachmentResourceBatch(PluginCall call) {
        async(call, "Failed to finish companion attachment resources.", () ->
            FolioleCompanionResourcePluginActions.finishAttachmentResourceBatch(getContext(), call));
    }

    @PluginMethod public void downloadContentBlobBatch(PluginCall call) {
        async(call, "Failed to download companion content blobs.", () ->
            FolioleCompanionResourcePluginActions.downloadContentBlobBatch(getContext(), call));
    }

    @PluginMethod public void finishContentBlobBatch(PluginCall call) {
        async(call, "Failed to finish companion content blobs.", () ->
            FolioleCompanionResourcePluginActions.finishContentBlobBatch(getContext(), call));
    }

    @PluginMethod public void resolveAttachmentResource(PluginCall call) {
        async(call, "Failed to resolve companion attachment resource.", () ->
            FolioleCompanionResourcePluginActions.resolveAttachmentResource(getContext(), call));
    }

    private void async(PluginCall call, String message, FileWork work) {
        fileExecutor.execute(() -> {
            try {
                call.resolve(work.run());
            } catch (Exception exception) {
                call.reject(FolioleCompanionPluginErrors.withCause(message, exception), exception);
            }
        });
    }

    private void dispatchDataRequest(JSObject event) throws Exception {
        String name = FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataRequestEvent(getContext());
        getActivity().runOnUiThread(() -> notifyListeners(name, event));
    }

    private void dispatchServiceHint(JSObject event) {
        try {
            String name = FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderServiceHintEvent(getContext());
            getActivity().runOnUiThread(() -> notifyListeners(name, event));
        } catch (Exception error) {
            android.util.Log.w("FolioleSyncDiscovery", "Hint dispatch failed", error);
        }
    }

    private void dispatchProviderState() {
        try {
            String name = FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderStateEvent(getContext());
            JSObject event = withParticipation(FolioleCompanionSyncGroupProvider.state());
            getActivity().runOnUiThread(() -> notifyListeners(name, event));
        } catch (Exception error) {
            android.util.Log.w("FolioleSyncProvider", "State dispatch failed", error);
        }
    }

    private void setParticipation(PluginCall call, String name) {
        async(call, "Failed to update Sync participation.", () -> {
            String key = FolioleCompanionSyncParticipationContractDefinitions.requestKey(getContext(), name);
            if (!call.getData().has(key)) throw new IllegalArgumentException(key + " is required.");
            boolean value = call.getBoolean(key, false);
            if ("syncEnabled".equals(name)) {
                FolioleCompanionSyncParticipationStore.setSyncEnabled(getContext(), value);
            } else {
                FolioleCompanionSyncParticipationStore.setSyncPaused(getContext(), value);
            }
            reconcileServiceMonitor();
            FolioleCompanionSyncGroupProvider.reconcile(this, getActivity(), isParticipating());
            return FolioleCompanionSyncParticipationStore.state(getContext(), lifecycleActive);
        });
    }

    private boolean isParticipating() throws Exception {
        return FolioleCompanionSyncParticipationStore.isParticipating(getContext(), lifecycleActive);
    }

    private void reconcileServiceMonitor() throws Exception {
        if (serviceMonitor == null) return;
        if (isParticipating()) serviceMonitor.start();
        else serviceMonitor.stop();
    }

    private JSObject withParticipation(JSObject result) throws Exception {
        JSObject participation = FolioleCompanionSyncParticipationStore.state(getContext(), lifecycleActive);
        for (java.util.Iterator<String> keys = participation.keys(); keys.hasNext();) {
            String key = keys.next();
            result.put(key, participation.get(key));
        }
        return result;
    }

    @Override protected void handleOnDestroy() {
        lifecycleActive = false;
        if (serviceMonitor != null) serviceMonitor.stop();
        FolioleCompanionSyncGroupProvider.pause(this);
        FolioleCompanionSyncGroupDataBridge.uninstall(this);
        super.handleOnDestroy();
        fileExecutor.shutdownNow();
    }

    @Override protected void handleOnPause() {
        lifecycleActive = false;
        if (serviceMonitor != null) serviceMonitor.stop();
        FolioleCompanionSyncGroupProvider.pause(this);
        super.handleOnPause();
    }

    @Override protected void handleOnResume() {
        super.handleOnResume();
        lifecycleActive = true;
        try { reconcileServiceMonitor(); }
        catch (Exception error) { android.util.Log.w("FolioleSyncDiscovery", "Resume failed", error); }
        fileExecutor.execute(() -> {
            try { FolioleCompanionSyncGroupProvider.reconcile(this, getActivity(), isParticipating()); }
            catch (Exception error) { android.util.Log.w("FolioleSyncProvider", "Resume failed", error); }
        });
    }

    private interface FileWork { JSObject run() throws Exception; }
}
