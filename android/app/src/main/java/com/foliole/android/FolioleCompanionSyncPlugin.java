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

    @PluginMethod public void desktopHttpRequest(PluginCall call) {
        FolioleCompanionNetworkPluginActions.desktopHttpRequest(getContext(), call);
    }

    @PluginMethod public void loadDiscoveryCandidates(PluginCall call) {
        FolioleCompanionNetworkPluginActions.loadDiscoveryCandidates(getContext(), call);
    }

    @PluginMethod public void startSyncGroupProvider(PluginCall call) {
        async(call, "Failed to start Sync Group provider.", () ->
            FolioleCompanionSyncGroupProvider.start(
                getContext(), getActivity(), call, this, this::dispatchDataRequest
            ));
    }

    @PluginMethod public void stopSyncGroupProvider(PluginCall call) {
        async(call, "Failed to stop Sync Group provider.", () ->
            FolioleCompanionSyncGroupProvider.stop(this));
    }

    @PluginMethod public void loadSyncGroupProviderState(PluginCall call) {
        call.resolve(FolioleCompanionSyncGroupProvider.state());
    }

    @PluginMethod public void approveSyncGroupJoinRequest(PluginCall call) {
        async(call, "Failed to approve Device.", () ->
            FolioleCompanionSyncGroupProvider.approve(getContext(), call));
    }

    @PluginMethod public void rejectSyncGroupJoinRequest(PluginCall call) {
        async(call, "Failed to reject Device.", () ->
            FolioleCompanionSyncGroupProvider.reject(getContext(), call));
    }

    @PluginMethod public void resolveSyncGroupDataRequest(PluginCall call) {
        try {
            FolioleCompanionSyncGroupProvider.resolveDataRequest(call.getData());
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

    @PluginMethod public void savePairingCredentials(PluginCall call) {
        FolioleCompanionPairingPluginActions.savePairingCredentials(getContext(), call);
    }

    @PluginMethod public void savePrimaryDeviceId(PluginCall call) {
        FolioleCompanionPairingPluginActions.savePrimaryDeviceId(getContext(), call);
    }

    @PluginMethod public void signCompanionSyncRequest(PluginCall call) {
        FolioleCompanionPairingPluginActions.signCompanionSyncRequest(getContext(), call);
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

    @Override protected void handleOnDestroy() {
        FolioleCompanionSyncGroupProvider.pause(this);
        super.handleOnDestroy();
        fileExecutor.shutdownNow();
    }

    @Override protected void handleOnPause() {
        FolioleCompanionSyncGroupProvider.pause(this);
        super.handleOnPause();
    }

    @Override protected void handleOnResume() {
        super.handleOnResume();
        fileExecutor.execute(() -> {
            try { FolioleCompanionSyncGroupProvider.resume(this); }
            catch (Exception error) { android.util.Log.w("FolioleSyncProvider", "Resume failed", error); }
        });
    }

    private interface FileWork { JSObject run() throws Exception; }
}
