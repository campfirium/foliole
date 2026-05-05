package com.foliole.android;

import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends FolioleCompanionDatabasePlugin {
    @PluginMethod
    public void desktopHttpRequest(PluginCall call) {
        FolioleCompanionNetworkPluginActions.desktopHttpRequest(getContext(), call);
    }

    @PluginMethod
    public void loadDiscoveryCandidates(PluginCall call) {
        FolioleCompanionNetworkPluginActions.loadDiscoveryCandidates(getContext(), call);
    }

    @PluginMethod
    public void loadPairingState(PluginCall call) {
        FolioleCompanionPairingPluginActions.loadPairingState(getContext(), call);
    }

    @PluginMethod
    public void savePairingCredentials(PluginCall call) {
        FolioleCompanionPairingPluginActions.savePairingCredentials(getContext(), call);
    }

    @PluginMethod
    public void signCompanionSyncRequest(PluginCall call) {
        FolioleCompanionPairingPluginActions.signCompanionSyncRequest(getContext(), call);
    }

    @PluginMethod
    public void syncAttachmentResource(PluginCall call) {
        withCall(call, "Failed to sync companion attachment resource.", FolioleCompanionResourcePluginActions::syncAttachmentResource);
    }

    @PluginMethod
    public void syncAttachmentResources(PluginCall call) {
        withCall(call, "Failed to sync companion attachment resources.", FolioleCompanionResourcePluginActions::syncAttachmentResources);
    }

    @PluginMethod
    public void loadMissingAttachmentResources(PluginCall call) {
        withCall(call, "Failed to load missing companion attachment resources.", FolioleCompanionResourcePluginActions::loadMissingAttachmentResources);
    }

    @PluginMethod
    public void loadMissingAttachmentResource(PluginCall call) {
        withCall(call, "Failed to load missing companion attachment resource.", FolioleCompanionResourcePluginActions::loadMissingAttachmentResource);
    }

    @PluginMethod
    public void loadMissingContentBlobHashes(PluginCall call) {
        withCall(call, "Failed to load missing companion content blobs.", FolioleCompanionResourcePluginActions::loadMissingContentBlobHashes);
    }

    @PluginMethod
    public void syncContentBlob(PluginCall call) {
        withCall(call, "Failed to sync companion content blob.", FolioleCompanionResourcePluginActions::syncContentBlob);
    }

    @PluginMethod
    public void syncContentBlobs(PluginCall call) {
        withCall(call, "Failed to sync companion content blobs.", FolioleCompanionResourcePluginActions::syncContentBlobs);
    }

    @PluginMethod
    public void resolveAttachmentResource(PluginCall call) {
        withCall(call, "Failed to resolve companion attachment resource.", FolioleCompanionResourcePluginActions::resolveAttachmentResource);
    }

    @PluginMethod
    public void loadPdfPageText(PluginCall call) {
        withCall(call, "Failed to load companion PDF page text.", FolioleCompanionResourcePluginActions::loadPdfPageText);
    }

    @PluginMethod
    public void searchPdfPageText(PluginCall call) {
        withCall(call, "Failed to search companion PDF page text.", FolioleCompanionResourcePluginActions::searchPdfPageText);
    }

    @PluginMethod
    public void loadExternalDocument(PluginCall call) {
        withCall(call, "Failed to load companion external document.", FolioleCompanionResourcePluginActions::loadExternalDocument);
    }

    @PluginMethod
    public void searchExternalDocuments(PluginCall call) {
        withCall(call, "Failed to search companion external documents.", FolioleCompanionResourcePluginActions::searchExternalDocuments);
    }

    @PluginMethod
    public void loadExternalDirectory(PluginCall call) {
        database(call, "Failed to load companion external directory.", FolioleCompanionDatabaseHelper::loadExternalDirectory);
    }

    @PluginMethod
    public void loadWorkspaceSyncState(PluginCall call) {
        database(call, "Failed to load companion workspace sync state.", FolioleCompanionDatabaseHelper::loadWorkspaceSyncState);
    }

    @PluginMethod
    public void diagnoseSync(PluginCall call) {
        database(call, "Failed to diagnose companion sync.", helper -> FolioleCompanionWorkspaceSyncPluginActions.diagnoseSync(getContext(), helper));
    }

    @PluginMethod
    public void saveWorkspaceSyncEndpoint(PluginCall call) {
        withCall(call, "Failed to save companion workspace sync endpoint.", FolioleCompanionWorkspaceSyncPluginActions::saveWorkspaceSyncEndpoint);
    }

    @PluginMethod
    public void recordWorkspaceSyncEvent(PluginCall call) {
        withCall(call, "Failed to record companion workspace sync event.", FolioleCompanionWorkspaceSyncPluginActions::recordWorkspaceSyncEvent);
    }

    @PluginMethod
    public void saveSyncOnboardingStatus(PluginCall call) {
        withCall(call, "Failed to save companion sync onboarding status.", FolioleCompanionWorkspaceSyncPluginActions::saveSyncOnboardingStatus);
    }

    @PluginMethod
    public void removeWorkspaceSyncRememberedTarget(PluginCall call) {
        withCall(call, "Failed to remove companion workspace sync target.", FolioleCompanionWorkspaceSyncPluginActions::removeWorkspaceSyncRememberedTarget);
    }

    @PluginMethod
    public void loadReadableArticle(PluginCall call) {
        database(call, "Failed to load companion readable article.", FolioleCompanionDatabaseHelper::loadReadableArticle);
    }

    @PluginMethod
    public void loadSyncIndex(PluginCall call) {
        database(call, "Failed to load companion sync index.", FolioleCompanionDatabaseHelper::loadSyncIndex);
    }

    @PluginMethod
    public void loadSyncNodeConflicts(PluginCall call) {
        database(call, "Failed to load companion sync node conflicts.", FolioleCompanionDatabaseHelper::loadSyncNodeConflicts);
    }

    @PluginMethod
    public void loadSyncStateChanges(PluginCall call) {
        withCall(call, "Failed to load companion sync state changes.", FolioleCompanionSyncDataPluginActions::loadSyncStateChanges);
    }

    @PluginMethod
    public void loadSyncStateCursor(PluginCall call) {
        database(call, "Failed to load companion sync state cursor.", FolioleCompanionSyncStatePluginActions::loadSyncStateCursor);
    }

    @PluginMethod
    public void saveSyncStateCursor(PluginCall call) {
        withCall(call, "Failed to save companion sync state cursor.", FolioleCompanionSyncStatePluginActions::saveSyncStateCursor);
    }

    @PluginMethod
    public void loadSyncPackCursor(PluginCall call) {
        database(call, "Failed to load companion sync pack cursor.", FolioleCompanionSyncStatePluginActions::loadSyncPackCursor);
    }

    @PluginMethod
    public void saveSyncPackCursor(PluginCall call) {
        withCall(call, "Failed to save companion sync pack cursor.", FolioleCompanionSyncStatePluginActions::saveSyncPackCursor);
    }

    @PluginMethod
    public void loadSyncStatePushCursor(PluginCall call) {
        database(call, "Failed to load companion sync state push cursor.", FolioleCompanionSyncStatePluginActions::loadSyncStatePushCursor);
    }

    @PluginMethod
    public void saveSyncStatePushCursor(PluginCall call) {
        withCall(call, "Failed to save companion sync state push cursor.", FolioleCompanionSyncStatePluginActions::saveSyncStatePushCursor);
    }

    @PluginMethod
    public void loadSyncNodeVersionCursor(PluginCall call) {
        database(call, "Failed to load companion sync node version cursor.", FolioleCompanionSyncStatePluginActions::loadSyncNodeVersionCursor);
    }

    @PluginMethod
    public void saveSyncNodeVersionCursor(PluginCall call) {
        withCall(call, "Failed to save companion sync node version cursor.", FolioleCompanionSyncStatePluginActions::saveSyncNodeVersionCursor);
    }

    @PluginMethod
    public void loadSyncNodeVersionPushCursor(PluginCall call) {
        database(call, "Failed to load companion sync node version push cursor.", FolioleCompanionSyncStatePluginActions::loadSyncNodeVersionPushCursor);
    }

    @PluginMethod
    public void saveSyncNodeVersionPushCursor(PluginCall call) {
        withCall(call, "Failed to save companion sync node version push cursor.", FolioleCompanionSyncStatePluginActions::saveSyncNodeVersionPushCursor);
    }

    @PluginMethod
    public void loadSyncReviewLogCursor(PluginCall call) {
        database(call, "Failed to load companion sync review log cursor.", FolioleCompanionSyncStatePluginActions::loadSyncReviewLogCursor);
    }

    @PluginMethod
    public void saveSyncReviewLogCursor(PluginCall call) {
        withCall(call, "Failed to save companion sync review log cursor.", FolioleCompanionSyncStatePluginActions::saveSyncReviewLogCursor);
    }

    @PluginMethod
    public void loadSyncReviewLogPushCursor(PluginCall call) {
        database(call, "Failed to load companion sync review log push cursor.", FolioleCompanionSyncStatePluginActions::loadSyncReviewLogPushCursor);
    }

    @PluginMethod
    public void saveSyncReviewLogPushCursor(PluginCall call) {
        withCall(call, "Failed to save companion sync review log push cursor.", FolioleCompanionSyncStatePluginActions::saveSyncReviewLogPushCursor);
    }

    @PluginMethod
    public void saveSyncPushAcks(PluginCall call) {
        withCall(call, "Failed to save companion sync push acknowledgements.", FolioleCompanionSyncStatePluginActions::saveSyncPushAcks);
    }

    @PluginMethod
    public void saveSyncSettingRecord(PluginCall call) {
        withCall(call, "Failed to save companion sync setting record.", FolioleCompanionSyncStatePluginActions::saveSyncSettingRecord);
    }

    @PluginMethod
    public void saveSyncNodeReadingRecord(PluginCall call) {
        withCall(call, "Failed to save companion sync node reading record.", FolioleCompanionSyncStatePluginActions::saveSyncNodeReadingRecord);
    }

    @PluginMethod
    public void saveSyncNodeReviewRecord(PluginCall call) {
        withCall(call, "Failed to save companion sync node review record.", FolioleCompanionSyncStatePluginActions::saveSyncNodeReviewRecord);
    }

    @PluginMethod
    public void saveSyncActiveViewState(PluginCall call) {
        withCall(call, "Failed to save companion sync active view state.", FolioleCompanionSyncStatePluginActions::saveSyncActiveViewState);
    }

    @PluginMethod
    public void saveSyncNodeViewState(PluginCall call) {
        withCall(call, "Failed to save companion sync node view state.", FolioleCompanionSyncStatePluginActions::saveSyncNodeViewState);
    }

    @PluginMethod
    public void loadSyncObjects(PluginCall call) {
        withCall(call, "Failed to load companion sync objects.", FolioleCompanionSyncDataPluginActions::loadSyncObjects);
    }

    @PluginMethod
    public void loadSyncNodeVersions(PluginCall call) {
        withCall(call, "Failed to load companion sync node versions.", FolioleCompanionSyncDataPluginActions::loadSyncNodeVersions);
    }

    @PluginMethod
    public void loadSyncReviewLog(PluginCall call) {
        withCall(call, "Failed to load companion sync review log.", FolioleCompanionSyncDataPluginActions::loadSyncReviewLog);
    }

    private void database(PluginCall call, String errorMessage, DatabaseWork work) {
        resolveWithDatabase(call, errorMessage, work);
    }

    private void withCall(PluginCall call, String errorMessage, PluginDatabaseWork work) {
        database(call, errorMessage, helper -> work.run(helper, call));
    }

    private interface PluginDatabaseWork { JSObject run(FolioleCompanionDatabaseHelper helper, PluginCall call) throws Exception; }
}
