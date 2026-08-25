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
    private final ExecutorService fileExecutor = Executors.newSingleThreadExecutor();
    private FolioleCompanionPluginLifecycle lifecycle;

    @Override public void load() {
        super.load();
        try {
            FolioleCompanionSyncGroupDataBridge.install(getContext(), this, this::dispatchDataRequest);
            lifecycle = new FolioleCompanionPluginLifecycle(getContext(), this, this::dispatchServiceHint);
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

    @PluginMethod public void startSyncGroupProvider(PluginCall call) {
        async(call, "Failed to start Sync Group provider.", () ->
            FolioleCompanionSyncGroupProvider.start(
                getContext(), getActivity(), call, this, this::dispatchDataRequest,
                this::dispatchProviderState, lifecycle.isParticipating()
            ));
    }

    @PluginMethod public void stopSyncGroupProvider(PluginCall call) {
        async(call, "Failed to stop Sync Group provider.", () ->
            lifecycle.withState(FolioleCompanionSyncGroupProvider.stop(this)));
    }

    @PluginMethod public void loadSyncGroupProviderState(PluginCall call) {
        try { call.resolve(lifecycle.withState(FolioleCompanionSyncGroupProvider.state())); }
        catch (Exception error) { call.reject("Failed to load Sync participation state.", error); }
    }

    @PluginMethod public void loadSyncParticipationState(PluginCall call) {
        try { call.resolve(lifecycle.state()); }
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
            lifecycle.withState(FolioleCompanionSyncGroupProvider.approve(getContext(), call)));
    }

    @PluginMethod public void rejectSyncGroupJoinRequest(PluginCall call) {
        async(call, "Failed to reject Device.", () ->
            lifecycle.withState(FolioleCompanionSyncGroupProvider.reject(getContext(), call)));
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

    @PluginMethod public void loadSyncGroupMemberRoute(PluginCall call) {
        async(call, "Failed to load inactive Sync Group route.", () ->
            FolioleCompanionSyncGroupAuthorizationPluginActions.load(getContext(), call));
    }

    @PluginMethod public void createSyncGroupJoinIntentKey(PluginCall call) {
        async(call, "Failed to create inactive Sync Group join key.", () ->
            FolioleCompanionSyncGroupAuthorizationPluginActions.createJoinIntentKey(getContext(), call));
    }

    @PluginMethod public void discardSyncGroupJoinIntentKey(PluginCall call) {
        async(call, "Failed to discard inactive Sync Group join key.", () ->
            FolioleCompanionSyncGroupAuthorizationPluginActions.discardJoinIntentKey(getContext(), call));
    }

    @PluginMethod public void consumeSyncGroupRouteGrant(PluginCall call) {
        async(call, "Failed to consume inactive Sync Group route grant.", () ->
            FolioleCompanionSyncGroupAuthorizationPluginActions.consumeGrant(getContext(), call));
    }

    @PluginMethod public void migrateLegacyPairingToMemberRoute(PluginCall call) {
        async(call, "Failed to migrate inactive Sync Group route.", () ->
            FolioleCompanionSyncGroupAuthorizationPluginActions.migrate(getContext(), call));
    }

    @PluginMethod public void revokeSyncGroupMemberRoute(PluginCall call) {
        async(call, "Failed to revoke inactive Sync Group route.", () ->
            FolioleCompanionSyncGroupAuthorizationPluginActions.revoke(getContext(), call));
    }

    @PluginMethod public void signSyncGroupMemberRequest(PluginCall call) {
        async(call, "Failed to sign inactive Sync Group route request.", () ->
            FolioleCompanionSyncGroupAuthorizationPluginActions.sign(getContext(), call));
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

    private void async(PluginCall call, String message, FolioleCompanionPluginWork work) {
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
            JSObject event = lifecycle.withState(FolioleCompanionSyncGroupProvider.state());
            getActivity().runOnUiThread(() -> notifyListeners(name, event));
        } catch (Exception error) {
            android.util.Log.w("FolioleSyncProvider", "State dispatch failed", error);
        }
    }

    private void setParticipation(PluginCall call, String name) {
        async(call, "Failed to update Sync participation.", () -> lifecycle.set(call, name));
    }

    @Override protected void handleOnDestroy() {
        if (lifecycle != null) lifecycle.pause();
        FolioleCompanionSyncGroupDataBridge.uninstall(this);
        super.handleOnDestroy();
        fileExecutor.shutdownNow();
    }

    @Override protected void handleOnPause() {
        if (lifecycle != null) lifecycle.pause();
        super.handleOnPause();
    }

    @Override protected void handleOnResume() {
        super.handleOnResume();
        try { if (lifecycle != null) lifecycle.resume(); }
        catch (Exception error) { android.util.Log.w("FolioleSyncDiscovery", "Resume failed", error); }
        fileExecutor.execute(() -> {
            try { if (lifecycle != null) lifecycle.reconcileProvider(); }
            catch (Exception error) { android.util.Log.w("FolioleSyncProvider", "Resume failed", error); }
        });
    }
}
