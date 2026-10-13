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
    private final ExecutorService framedSendExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService syncFileExecutor = Executors.newSingleThreadExecutor();
    final FolioleCompanionFramedSyncPayloadBudgetActions payloadBudget = new FolioleCompanionFramedSyncPayloadBudgetActions();
    private boolean lifecycleActive = true;

    @PluginMethod public void postRequestSyncHttp(PluginCall call) {
        FolioleCompanionRequestSyncHttp.post(getContext(), call, framedSendExecutor);
    }

    @PluginMethod public void cancelRequestSyncHttp(PluginCall call) {
        try { FolioleCompanionRequestSyncHttp.cancel(call); }
        catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    @PluginMethod public void accessFramedSyncFile(PluginCall call) {
        FolioleCompanionSyncAsync.run(syncFileExecutor, call, "Failed to access Sync file.", () ->
            FolioleCompanionFramedSyncFileActions.access(getContext(), call));
    }

    @Override public void load() {
        super.load();
        try {
            FolioleCompanionSyncGroupDataBridge.install(getContext(), this, this::dispatchDataRequest);
            payloadBudget.attach(getBridge());
        } catch (Exception error) {
            android.util.Log.w("FolioleSyncDiscovery", "Monitor unavailable", error);
        }
    }

    @PluginMethod public void maintainAttachmentFiles(PluginCall call) {
        fileExecutor.execute(() -> {
            try { call.resolve(FolioleAttachmentMaintenanceFiles.execute(getContext(), call)); }
            catch (Exception error) { call.reject("Attachment maintenance failed", error); }
        });
    }

    @PluginMethod public void desktopHttpRequest(PluginCall call) {
        FolioleCompanionNetworkPluginActions.desktopHttpRequest(getContext(), call);
    }

    @PluginMethod public void beginSyncRun(PluginCall call) {
        try { call.resolve(FolioleCompanionSyncTrigger.begin(call)); }
        catch (Exception error) { call.reject("Sync command is unavailable.", error); }
    }

    @PluginMethod public void loadDiscoveryCandidates(PluginCall call) {
        try {
            FolioleCompanionNetworkPluginActions.loadDiscoveryCandidates(getContext(), call);
        } catch (Exception error) {
            call.reject(FolioleCompanionPluginErrors.withCause("Failed to load Sync Group candidates.", error), error);
        }
    }

    @PluginMethod public void loadSyncGroupDeviceIdentity(PluginCall call) {
        try {
            call.resolve(FolioleCompanionSyncDeviceIdentity.load(
                getContext(), call.getString("database_path", "")));
        } catch (Exception error) {
            call.reject("Failed to load Device identity.", error);
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
        async(call, "Failed to start Sync Group provider.", () -> {
            JSObject result = FolioleCompanionSyncGroupProvider.start(
                getContext(), getActivity(), call, this, this::dispatchDataRequest,
                this::dispatchProviderState, isParticipating()
            );
            return result;
        });
    }

    @PluginMethod public void stopSyncGroupProvider(PluginCall call) {
        async(call, "Failed to stop Sync Group provider.", () -> {
            JSObject result = FolioleCompanionSyncGroupProvider.stop(this);
            return withParticipation(result);
        });
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

    @PluginMethod public void acceptSyncGroupJoinRequest(PluginCall call) {
        async(call, "Failed to accept Device.", () ->
            withParticipation(FolioleCompanionSyncGroupProvider.accept(getContext(), call)));
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

    @PluginMethod public void configureFramedSyncPayloadBudget(PluginCall call) {
        payloadBudget.configureAsync(call);
    }

    @PluginMethod public void closeFramedSyncPayloadBudget(PluginCall call) {
        payloadBudget.closeAsync(call);
    }

    @PluginMethod public void validateFramedSyncPayloadLoan(PluginCall call) {
        payloadBudget.validateNow(call);
    }

    @PluginMethod public void releaseFramedSyncPayloadLoan(PluginCall call) {
        payloadBudget.releaseNow(call);
    }

    @PluginMethod public void signCompanionSyncRequest(PluginCall call) {
        async(call, "Failed to sign Sync Group request.", () ->
            FolioleCompanionSyncGroupSigning.sign(getContext(), call));
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

    @PluginMethod public void readRemoteImageResponse(PluginCall call) {
        async(call, "Failed to read image response.", () -> FolioleRemoteImageFiles.read(call));
    }

    @PluginMethod public void writeImageAttachment(PluginCall call) {
        async(call, "Failed to store image.", () -> FolioleRemoteImageFiles.write(getContext(), call));
    }

    @PluginMethod public void resolveAttachmentResource(PluginCall call) {
        if (BuildConfig.DEBUG) android.util.Log.d("FolioleImage", "resolveAttachmentResource");
        async(call, "Failed to resolve companion attachment resource.", () ->
            FolioleCompanionResourcePluginActions.resolveAttachmentResource(getContext(), call));
    }

    private void async(PluginCall call, String message, FolioleCompanionSyncAsync.Work work) {
        FolioleCompanionSyncAsync.run(fileExecutor, call, message, work);
    }

    private void dispatchDataRequest(JSObject event) throws Exception {
        FolioleCompanionSyncPluginEvents.dataRequest(getContext(), getActivity(), event, this::notifyListeners);
    }

    private void dispatchProviderState() {
        FolioleCompanionSyncPluginEvents.providerState(getContext(), getActivity(), lifecycleActive, this::notifyListeners);
    }

    private void setParticipation(PluginCall call, String name) {
        async(call, "Failed to update Sync participation.", () -> {
            FolioleCompanionSyncParticipationActions.set(getContext(), call, name, lifecycleActive);
            FolioleCompanionSyncGroupProvider.reconcile(this, getActivity(), isParticipating());
            return FolioleCompanionSyncParticipationStore.state(getContext(), lifecycleActive);
        });
    }

    private boolean isParticipating() throws Exception {
        return FolioleCompanionSyncParticipationStore.isParticipating(getContext(), lifecycleActive);
    }

    private JSObject withParticipation(JSObject result) throws Exception {
        return FolioleCompanionSyncPluginEvents.withParticipation(getContext(), lifecycleActive, result);
    }

    @Override protected void handleOnDestroy() {
        lifecycleActive = false;
        payloadBudget.destroy();
        fileExecutor.execute(() -> {
            FolioleCompanionSyncGroupProvider.pause(this);
            FolioleCompanionSyncGroupDataBridge.uninstall(this);
        });
        super.handleOnDestroy();
        fileExecutor.shutdown();
        framedSendExecutor.shutdown();
        syncFileExecutor.shutdown();
    }

    @Override protected void handleOnPause() {
        lifecycleActive = false;
        fileExecutor.execute(() -> FolioleCompanionSyncGroupProvider.pause(this));
        super.handleOnPause();
    }

    @Override protected void handleOnResume() {
        super.handleOnResume();
        lifecycleActive = true;
        fileExecutor.execute(() -> {
            try { FolioleCompanionSyncGroupProvider.reconcile(this, getActivity(), isParticipating()); }
            catch (Exception error) { android.util.Log.w("FolioleSyncProvider", "Resume failed", error); }
        });
    }

}
