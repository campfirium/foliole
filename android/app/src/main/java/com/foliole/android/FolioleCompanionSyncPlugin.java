package com.foliole.android;

import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends FolioleCompanionDatabasePlugin {
    @PluginMethod
    public void desktopHttpRequest(PluginCall call) {
        FolioleCompanionNetworkPluginActions.desktopHttpRequest(call);
    }


    @PluginMethod
    public void syncAttachmentResource(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to sync companion attachment resource.",
            databaseHelper -> FolioleCompanionResourcePluginActions.syncAttachmentResource(databaseHelper, call)
        );
    }

    @PluginMethod
    public void syncAttachmentResources(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to sync companion attachment resources.",
            databaseHelper -> FolioleCompanionResourcePluginActions.syncAttachmentResources(databaseHelper, call)
        );
    }


    @PluginMethod
    public void loadMissingAttachmentResources(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load missing companion attachment resources.",
            databaseHelper -> FolioleCompanionResourcePluginActions.loadMissingAttachmentResources(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadMissingAttachmentResource(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load missing companion attachment resource.",
            databaseHelper -> FolioleCompanionResourcePluginActions.loadMissingAttachmentResource(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadMissingContentBlobHashes(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load missing companion content blobs.",
            databaseHelper -> FolioleCompanionResourcePluginActions.loadMissingContentBlobHashes(databaseHelper, call)
        );
    }


    @PluginMethod
    public void syncContentBlob(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to sync companion content blob.",
            databaseHelper -> FolioleCompanionResourcePluginActions.syncContentBlob(databaseHelper, call)
        );
    }

    @PluginMethod
    public void syncContentBlobs(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to sync companion content blobs.",
            databaseHelper -> FolioleCompanionResourcePluginActions.syncContentBlobs(databaseHelper, call)
        );
    }


    @PluginMethod
    public void resolveAttachmentResource(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to resolve companion attachment resource.",
            databaseHelper -> FolioleCompanionResourcePluginActions.resolveAttachmentResource(databaseHelper, call)
        );
    }


    @PluginMethod
    public void loadPdfPageText(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion PDF page text.",
            databaseHelper -> FolioleCompanionResourcePluginActions.loadPdfPageText(databaseHelper, call)
        );
    }


    @PluginMethod
    public void searchPdfPageText(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to search companion PDF page text.",
            databaseHelper -> FolioleCompanionResourcePluginActions.searchPdfPageText(databaseHelper, call)
        );
    }


    @PluginMethod
    public void loadExternalDocument(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion external document.",
            databaseHelper -> FolioleCompanionResourcePluginActions.loadExternalDocument(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadExternalDirectory(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion external directory.",
            FolioleCompanionDatabaseHelper::loadExternalDirectory
        );
    }


    @PluginMethod
    public void searchExternalDocuments(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to search companion external documents.",
            databaseHelper -> FolioleCompanionResourcePluginActions.searchExternalDocuments(databaseHelper, call)
        );
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
    public void loadWorkspaceSyncState(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion workspace sync state.",
            FolioleCompanionDatabaseHelper::loadWorkspaceSyncState
        );
    }

    @PluginMethod
    public void diagnoseSync(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to diagnose companion sync.",
            databaseHelper -> FolioleCompanionWorkspaceSyncPluginActions.diagnoseSync(getContext(), databaseHelper)
        );
    }

    @PluginMethod
    public void saveWorkspaceSyncEndpoint(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion workspace sync endpoint.",
            databaseHelper -> FolioleCompanionWorkspaceSyncPluginActions.saveWorkspaceSyncEndpoint(databaseHelper, call)
        );
    }

    @PluginMethod
    public void recordWorkspaceSyncEvent(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to record companion workspace sync event.",
            databaseHelper -> FolioleCompanionWorkspaceSyncPluginActions.recordWorkspaceSyncEvent(databaseHelper, call)
        );
    }

    @PluginMethod
    public void saveSyncOnboardingStatus(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync onboarding status.",
            databaseHelper -> FolioleCompanionWorkspaceSyncPluginActions.saveSyncOnboardingStatus(databaseHelper, call)
        );
    }

    @PluginMethod
    public void removeWorkspaceSyncRememberedTarget(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to remove companion workspace sync target.",
            databaseHelper -> FolioleCompanionWorkspaceSyncPluginActions.removeWorkspaceSyncRememberedTarget(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadReadableArticle(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion readable article.",
            FolioleCompanionDatabaseHelper::loadReadableArticle
        );
    }

    @PluginMethod
    public void loadSyncIndex(PluginCall call) {
        resolveWithDatabase(call, "Failed to load companion sync index.", FolioleCompanionDatabaseHelper::loadSyncIndex);
    }

    @PluginMethod
    public void loadSyncNodeConflicts(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync node conflicts.",
            FolioleCompanionDatabaseHelper::loadSyncNodeConflicts
        );
    }

    @PluginMethod
    public void loadSyncStateChanges(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync state changes.",
            databaseHelper -> FolioleCompanionSyncDataPluginActions.loadSyncStateChanges(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncStateCursor(PluginCall call) {
        resolveWithDatabase(call, "Failed to load companion sync state cursor.", FolioleCompanionDatabaseHelper::loadSyncStateCursor);
    }

    @PluginMethod
    public void saveSyncStateCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync state cursor.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncStateCursor(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncPackCursor(PluginCall call) {
        resolveWithDatabase(call, "Failed to load companion sync pack cursor.", FolioleCompanionDatabaseHelper::loadSyncPackCursor);
    }

    @PluginMethod
    public void saveSyncPackCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync pack cursor.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncPackCursor(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncStatePushCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync state push cursor.",
            FolioleCompanionDatabaseHelper::loadSyncStatePushCursor
        );
    }

    @PluginMethod
    public void saveSyncStatePushCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync state push cursor.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncStatePushCursor(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncNodeVersionCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync node version cursor.",
            FolioleCompanionDatabaseHelper::loadSyncNodeVersionCursor
        );
    }

    @PluginMethod
    public void saveSyncNodeVersionCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node version cursor.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncNodeVersionCursor(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncNodeVersionPushCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync node version push cursor.",
            FolioleCompanionDatabaseHelper::loadSyncNodeVersionPushCursor
        );
    }

    @PluginMethod
    public void saveSyncNodeVersionPushCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node version push cursor.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncNodeVersionPushCursor(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncReviewLogCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync review log cursor.",
            FolioleCompanionDatabaseHelper::loadSyncReviewLogCursor
        );
    }

    @PluginMethod
    public void saveSyncReviewLogCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync review log cursor.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncReviewLogCursor(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncReviewLogPushCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync review log push cursor.",
            FolioleCompanionDatabaseHelper::loadSyncReviewLogPushCursor
        );
    }

    @PluginMethod
    public void saveSyncReviewLogPushCursor(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync review log push cursor.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncReviewLogPushCursor(databaseHelper, call)
        );
    }

    @PluginMethod
    public void saveSyncPushAcks(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync push acknowledgements.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncPushAcks(databaseHelper, call)
        );
    }

    @PluginMethod
    public void saveSyncSettingRecord(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync setting record.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncSettingRecord(databaseHelper, call)
        );
    }

    @PluginMethod
    public void saveSyncNodeReadingRecord(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node reading record.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncNodeReadingRecord(databaseHelper, call)
        );
    }

    @PluginMethod
    public void saveSyncNodeReviewRecord(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node review record.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncNodeReviewRecord(databaseHelper, call)
        );
    }

    @PluginMethod
    public void saveSyncActiveViewState(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync active view state.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncActiveViewState(databaseHelper, call)
        );
    }

    @PluginMethod
    public void saveSyncNodeViewState(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node view state.",
            databaseHelper -> FolioleCompanionSyncStatePluginActions.saveSyncNodeViewState(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncObjects(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync objects.",
            databaseHelper -> FolioleCompanionSyncDataPluginActions.loadSyncObjects(databaseHelper, call)
        );
    }

    @PluginMethod
    public void applySyncObjects(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion sync objects.",
            databaseHelper -> FolioleCompanionSyncDataPluginActions.applySyncObjects(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncNodeVersions(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync node versions.",
            databaseHelper -> FolioleCompanionSyncDataPluginActions.loadSyncNodeVersions(databaseHelper, call)
        );
    }

    @PluginMethod
    public void loadSyncReviewLog(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync review log.",
            databaseHelper -> FolioleCompanionSyncDataPluginActions.loadSyncReviewLog(databaseHelper, call)
        );
    }

    @PluginMethod
    public void applySyncNodeVersions(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion sync node versions.",
            databaseHelper -> FolioleCompanionSyncDataPluginActions.applySyncNodeVersions(databaseHelper, call)
        );
    }

    @PluginMethod
    public void applySyncReviewLog(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion sync review log.",
            databaseHelper -> FolioleCompanionSyncDataPluginActions.applySyncReviewLog(databaseHelper, call)
        );
    }
}
