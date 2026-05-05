package com.foliole.android;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends Plugin {

    private interface DatabaseWork {
        JSObject run(FolioleCompanionDatabaseHelper databaseHelper) throws Exception;
    }

    private void resolveWithDatabase(PluginCall call, String errorMessage, DatabaseWork work) {
        new Thread(() -> {
            FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
            try {
                call.resolve(work.run(databaseHelper));
            } catch (Exception exception) {
                call.reject(errorMessage, exception);
            } finally {
                databaseHelper.close();
            }
        }).start();
    }


    @PluginMethod
    public void desktopHttpRequest(PluginCall call) {
        new Thread(() -> {
            try {
                String url = call.getString("url");
                String method = call.getString("method");
                if (url == null || url.trim().isEmpty()) {
                    call.reject("url is required.");
                    return;
                }
                if (method == null || method.trim().isEmpty()) {
                    call.reject("method is required.");
                    return;
                }
                call.resolve(FolioleCompanionDesktopHttpClient.request(
                    url,
                    method,
                    call.getData().optJSONObject("headers"),
                    call.getString("body")
                ));
            } catch (Exception exception) {
                call.reject("Desktop HTTP request failed.", exception);
            }
        }).start();
    }


    @PluginMethod
    public void syncAttachmentResource(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to sync companion attachment resource.",
            databaseHelper -> databaseHelper.syncAttachmentResource(
                call.getString("attachment_id"),
                call.getString("content_hash"),
                call.getString("url"),
                call.getData().optJSONObject("headers")
            )
        );
    }


    @PluginMethod
    public void loadMissingAttachmentResources(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load missing companion attachment resources.",
            databaseHelper -> databaseHelper.loadMissingAttachmentResources(call.getInt("limit", 50))
        );
    }

    @PluginMethod
    public void loadMissingAttachmentResource(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load missing companion attachment resource.",
            databaseHelper -> databaseHelper.loadMissingAttachmentResource(call.getString("attachment_id"))
        );
    }

    @PluginMethod
    public void loadMissingContentBlobHashes(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load missing companion content blobs.",
            databaseHelper -> databaseHelper.loadMissingContentBlobHashes(call.getInt("limit", 50))
        );
    }


    @PluginMethod
    public void syncContentBlob(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to sync companion content blob.",
            databaseHelper -> databaseHelper.syncContentBlob(
                call.getString("hash"),
                call.getString("url"),
                call.getData().optJSONObject("headers")
            )
        );
    }


    @PluginMethod
    public void resolveAttachmentResource(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to resolve companion attachment resource.",
            databaseHelper -> databaseHelper.resolveAttachmentResource(call.getString("attachment_id"))
        );
    }


    @PluginMethod
    public void loadPdfPageText(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion PDF page text.",
            databaseHelper -> databaseHelper.loadPdfPageText(call.getString("attachment_id"))
        );
    }


    @PluginMethod
    public void searchPdfPageText(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to search companion PDF page text.",
            databaseHelper -> databaseHelper.searchPdfPageText(call.getString("query"), call.getInt("limit", 20))
        );
    }


    @PluginMethod
    public void loadExternalDocument(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to load companion external document.",
            databaseHelper -> databaseHelper.loadExternalDocument(call.getString("document_id"))
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
            databaseHelper -> databaseHelper.searchExternalDocuments(call.getString("query"), call.getInt("limit", 20))
        );
    }


    @PluginMethod
    public void loadDiscoveryCandidates(PluginCall call) {
        new Thread(() -> {
            try {
                JSArray endpointUrls = new JSArray();
                addEndpoint(endpointUrls, "10.0.2.2");
                for (String endpointUrl : FolioleCompanionNsdDiscovery.discoverEndpointUrls(getContext())) {
                    endpointUrls.put(endpointUrl);
                }
                JSObject result = new JSObject();
                result.put("endpoint_urls", endpointUrls);
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Failed to load companion discovery candidates.", exception);
            }
        }).start();
    }


    private void addEndpoint(JSArray endpointUrls, String hostAddress) {
        endpointUrls.put("http://" + hostAddress + ":38641");
    }

    @PluginMethod
    public void loadPairingState(PluginCall call) {
        try {
            call.resolve(FolioleCompanionPairingStore.loadPairingState(getContext()));
        } catch (Exception exception) {
            call.reject("Failed to load companion pairing state.", exception);
        }
    }

    @PluginMethod
    public void savePairingCredentials(PluginCall call) {
        try {
            String deviceId = call.getString("device_id");
            String deviceKind = call.getString("device_kind");
            String deviceName = call.getString("device_name");
            String deviceSecret = call.getString("device_secret");
            String pairedAt = call.getString("paired_at");
            if (deviceId == null || deviceId.trim().isEmpty()) {
                call.reject("device_id is required.");
                return;
            }
            if (deviceKind == null || deviceKind.trim().isEmpty()) {
                call.reject("device_kind is required.");
                return;
            }
            if (deviceName == null || deviceName.trim().isEmpty()) {
                call.reject("device_name is required.");
                return;
            }
            if (deviceSecret == null || deviceSecret.trim().isEmpty()) {
                call.reject("device_secret is required.");
                return;
            }
            if (pairedAt == null || pairedAt.trim().isEmpty()) {
                call.reject("paired_at is required.");
                return;
            }
            call.resolve(FolioleCompanionPairingStore.savePairingCredentials(
                getContext(),
                deviceId,
                deviceKind,
                deviceName,
                deviceSecret,
                pairedAt
            ));
        } catch (Exception exception) {
            call.reject("Failed to save companion pairing credentials.", exception);
        }
    }

    @PluginMethod
    public void signCompanionSyncRequest(PluginCall call) {
        try {
            String method = call.getString("method");
            String pathWithQuery = call.getString("path_with_query");
            String timestamp = call.getString("timestamp");
            String nonce = call.getString("nonce");
            String bodyHash = call.getString("body_hash");
            if (method == null || method.trim().isEmpty()) {
                call.reject("method is required.");
                return;
            }
            if (pathWithQuery == null || pathWithQuery.trim().isEmpty()) {
                call.reject("path_with_query is required.");
                return;
            }
            if (timestamp == null || timestamp.trim().isEmpty()) {
                call.reject("timestamp is required.");
                return;
            }
            if (nonce == null || nonce.trim().isEmpty()) {
                call.reject("nonce is required.");
                return;
            }
            if (bodyHash == null || bodyHash.trim().isEmpty()) {
                call.reject("body_hash is required.");
                return;
            }
            call.resolve(FolioleCompanionPairingStore.signRequest(
                getContext(),
                method,
                pathWithQuery,
                timestamp,
                nonce,
                bodyHash
            ));
        } catch (Exception exception) {
            call.reject("Failed to sign companion sync request.", exception);
        }
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
    public void applySyncPack(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion sync pack.",
            databaseHelper -> {
                String packPath = call.getString("pack_path");
                if (packPath == null || packPath.trim().isEmpty()) {
                    throw new IllegalArgumentException("pack_path is required.");
                }
                return databaseHelper.applySyncPack(packPath.trim());
            }
        );
    }

    @PluginMethod
    public void applyDesktopSyncPack(PluginCall call) {
        resolveWithDatabase(
            call,
            "Failed to apply companion desktop sync pack.",
            databaseHelper -> {
                String url = call.getString("url");
                if (url == null || url.trim().isEmpty()) {
                    throw new IllegalArgumentException("url is required.");
                }
                return databaseHelper.applyDesktopSyncPack(
                    url.trim(),
                    call.getData().optJSONObject("headers")
                );
            }
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
