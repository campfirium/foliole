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

    @Override protected void handleOnDestroy() {
        super.handleOnDestroy();
        fileExecutor.shutdownNow();
    }

    private interface FileWork { JSObject run() throws Exception; }
}
