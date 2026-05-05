package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends Plugin {
    private static final int DATABASE_EXECUTOR_THREADS = 4;

    private final ExecutorService databaseExecutor = Executors.newFixedThreadPool(DATABASE_EXECUTOR_THREADS);
    private final Object databaseHelperLock = new Object();
    private FolioleCompanionDatabaseHelper databaseHelper;

    private interface DatabaseWork {
        JSObject run(FolioleCompanionDatabaseHelper databaseHelper) throws Exception;
    }

    private FolioleCompanionDatabaseHelper getDatabaseHelper() {
        synchronized (databaseHelperLock) {
            if (databaseHelper == null) {
                databaseHelper = new FolioleCompanionDatabaseHelper(getContext().getApplicationContext());
            }
            return databaseHelper;
        }
    }

    private void resolveWithDatabase(PluginCall call, String errorMessage, DatabaseWork work) {
        databaseExecutor.execute(() -> {
            try {
                call.resolve(work.run(getDatabaseHelper()));
            } catch (Exception exception) {
                call.reject(formatPluginError(errorMessage, exception), exception);
            }
        });
    }

    private static String formatPluginError(String errorMessage, Exception exception) {
        String detail = exception.getMessage();
        if (detail == null || detail.trim().isEmpty()) {
            return errorMessage;
        }
        return errorMessage + " " + detail.trim();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        databaseExecutor.shutdown();
        try {
            if (!databaseExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                databaseExecutor.shutdownNow();
            }
        } catch (InterruptedException exception) {
            databaseExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
        synchronized (databaseHelperLock) {
            if (databaseHelper != null) {
                databaseHelper.close();
                databaseHelper = null;
            }
        }
    }

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
            databaseHelper -> FolioleCompanionSyncDiagnostics.diagnose(
                getContext(),
                databaseHelper.getReadableDatabase(),
                getContext().getDatabasePath(FolioleCompanionDatabaseHelper.DATABASE_NAME).getAbsolutePath()
            )
        );
    }

    @PluginMethod
    public void saveWorkspaceSyncEndpoint(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion workspace sync endpoint.",
            databaseHelper -> databaseHelper.saveWorkspaceSyncEndpoint(call.getString("endpoint_url"))
        );
    }

    @PluginMethod
    public void recordWorkspaceSyncEvent(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to record companion workspace sync event.",
            databaseHelper -> databaseHelper.recordWorkspaceSyncEvent(
                call.getString("endpoint_url"),
                call.getString("status"),
                call.getString("message"),
                call.getString("occurred_at")
            )
        );
    }

    @PluginMethod
    public void saveSyncOnboardingStatus(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync onboarding status.",
            databaseHelper -> databaseHelper.saveSyncOnboardingStatus(call.getString("status"))
        );
    }

    @PluginMethod
    public void removeWorkspaceSyncRememberedTarget(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to remove companion workspace sync target.",
            databaseHelper -> {
                String endpointUrl = call.getString("endpoint_url");
                if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
                    throw new IllegalArgumentException("endpoint_url is required.");
                }
                return databaseHelper.removeWorkspaceSyncRememberedTarget(endpointUrl);
            }
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
            databaseHelper -> {
                Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                    ? call.getData().getInt("cursor")
                    : null;
                return databaseHelper.loadSyncStateChanges(cursor, call.getData().optInt("limit", 500));
            }
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
            databaseHelper -> {
                Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                    ? call.getData().getInt("cursor")
                    : null;
                return databaseHelper.saveSyncStateCursor(cursor);
            }
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
            databaseHelper -> {
                Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                    ? call.getData().getInt("cursor")
                    : null;
                return databaseHelper.saveSyncPackCursor(cursor);
            }
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
            databaseHelper -> {
                Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                    ? call.getData().getInt("cursor")
                    : null;
                return databaseHelper.saveSyncStatePushCursor(cursor);
            }
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
            databaseHelper -> databaseHelper.saveSyncNodeVersionCursor(call.getData().optJSONObject("cursor"))
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
            databaseHelper -> databaseHelper.saveSyncNodeVersionPushCursor(call.getData().optJSONObject("cursor"))
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
            databaseHelper -> databaseHelper.saveSyncReviewLogCursor(call.getData().optJSONObject("cursor"))
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
            databaseHelper -> databaseHelper.saveSyncReviewLogPushCursor(call.getData().optJSONObject("cursor"))
        );
    }

    @PluginMethod
    public void saveSyncPushAcks(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync push acknowledgements.",
            databaseHelper -> databaseHelper.saveSyncPushAcks(call.getData().optJSONArray("acks"))
        );
    }

    @PluginMethod
    public void saveSyncSettingRecord(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync setting record.",
            databaseHelper -> databaseHelper.saveSyncSettingRecord(call.getData())
        );
    }

    @PluginMethod
    public void saveSyncNodeReadingRecord(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node reading record.",
            databaseHelper -> databaseHelper.saveSyncNodeReadingRecord(call.getData())
        );
    }

    @PluginMethod
    public void saveSyncNodeReviewRecord(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node review record.",
            databaseHelper -> databaseHelper.saveSyncNodeReviewRecord(call.getData())
        );
    }

    @PluginMethod
    public void saveSyncActiveViewState(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync active view state.",
            databaseHelper -> databaseHelper.saveSyncActiveViewState(call.getData())
        );
    }

    @PluginMethod
    public void saveSyncNodeViewState(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to save companion sync node view state.",
            databaseHelper -> databaseHelper.saveSyncNodeViewState(call.getData())
        );
    }

    @PluginMethod
    public void loadSyncObjects(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync objects.",
            databaseHelper -> databaseHelper.loadSyncObjects(
                call.getData().optJSONArray("object_ids"),
                call.getData().optJSONArray("object_types")
            )
        );
    }

    @PluginMethod
    public void applySyncObjects(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion sync objects.",
            databaseHelper -> databaseHelper.applySyncObjects(call.getData().optJSONArray("objects"))
        );
    }

    @PluginMethod
    public void loadSyncNodeVersions(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync node versions.",
            databaseHelper -> databaseHelper.loadSyncNodeVersions(
                call.getData().optJSONObject("cursor"),
                call.getData().optInt("limit", 500)
            )
        );
    }

    @PluginMethod
    public void loadSyncReviewLog(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion sync review log.",
            databaseHelper -> databaseHelper.loadSyncReviewLog(
                call.getData().optJSONObject("cursor"),
                call.getData().optInt("limit", 500)
            )
        );
    }

    @PluginMethod
    public void applySyncNodeVersions(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion sync node versions.",
            databaseHelper -> databaseHelper.applySyncNodeVersions(call.getData().optJSONArray("nodes"))
        );
    }

    @PluginMethod
    public void applySyncReviewLog(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion sync review log.",
            databaseHelper -> databaseHelper.applySyncReviewLog(call.getData().optJSONArray("reviews"))
        );
    }
}
