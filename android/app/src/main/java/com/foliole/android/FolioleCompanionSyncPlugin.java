package com.foliole.android;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends Plugin {


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
        new Thread(() -> {
            FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
            try {
                call.resolve(databaseHelper.syncAttachmentResource(
                    call.getString("attachment_id"),
                    call.getString("content_hash"),
                    call.getString("url"),
                    call.getData().optJSONObject("headers")
                ));
            } catch (Exception exception) {
                call.reject("Failed to sync companion attachment resource.", exception);
            } finally {
                databaseHelper.close();
            }
        }).start();
    }


    @PluginMethod
    public void loadMissingContentBlobHashes(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadMissingContentBlobHashes(call.getInt("limit", 50)));
        } catch (Exception exception) {
            call.reject("Failed to load missing companion content blobs.", exception);
        } finally {
            databaseHelper.close();
        }
    }


    @PluginMethod
    public void syncContentBlob(PluginCall call) {
        new Thread(() -> {
            FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
            try {
                call.resolve(databaseHelper.syncContentBlob(
                    call.getString("hash"),
                    call.getString("url"),
                    call.getData().optJSONObject("headers")
                ));
            } catch (Exception exception) {
                call.reject("Failed to sync companion content blob.", exception);
            } finally {
                databaseHelper.close();
            }
        }).start();
    }


    @PluginMethod
    public void resolveAttachmentResource(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.resolveAttachmentResource(call.getString("attachment_id")));
        } catch (Exception exception) {
            call.reject("Failed to resolve companion attachment resource.", exception);
        } finally {
            databaseHelper.close();
        }
    }


    @PluginMethod
    public void loadPdfPageText(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadPdfPageText(call.getString("attachment_id")));
        } catch (Exception exception) {
            call.reject("Failed to load companion PDF page text.", exception);
        } finally {
            databaseHelper.close();
        }
    }


    @PluginMethod
    public void searchPdfPageText(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.searchPdfPageText(call.getString("query"), call.getInt("limit", 20)));
        } catch (Exception exception) {
            call.reject("Failed to search companion PDF page text.", exception);
        } finally {
            databaseHelper.close();
        }
    }


    @PluginMethod
    public void loadExternalDocument(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadExternalDocument(call.getString("document_id")));
        } catch (Exception exception) {
            call.reject("Failed to load companion external document.", exception);
        } finally {
            databaseHelper.close();
        }
    }


    @PluginMethod
    public void searchExternalDocuments(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.searchExternalDocuments(call.getString("query"), call.getInt("limit", 20)));
        } catch (Exception exception) {
            call.reject("Failed to search companion external documents.", exception);
        } finally {
            databaseHelper.close();
        }
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
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadWorkspaceSyncState());
        } catch (Exception exception) {
            call.reject("Failed to load companion workspace sync state.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void diagnoseSync(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(FolioleCompanionSyncDiagnostics.diagnose(
                getContext(),
                databaseHelper.getReadableDatabase(),
                getContext().getDatabasePath(FolioleCompanionDatabaseHelper.DATABASE_NAME).getAbsolutePath()
            ));
        } catch (Exception exception) {
            call.reject("Failed to diagnose companion sync.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveWorkspaceSyncEndpoint(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveWorkspaceSyncEndpoint(call.getString("endpoint_url")));
        } catch (Exception exception) {
            call.reject("Failed to save companion workspace sync endpoint.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void recordWorkspaceSyncEvent(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.recordWorkspaceSyncEvent(
                call.getString("endpoint_url"),
                call.getString("status"),
                call.getString("message"),
                call.getString("occurred_at")
            ));
        } catch (Exception exception) {
            call.reject("Failed to record companion workspace sync event.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncOnboardingStatus(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncOnboardingStatus(call.getString("status")));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync onboarding status.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void removeWorkspaceSyncRememberedTarget(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            String endpointUrl = call.getString("endpoint_url");
            if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
                call.reject("endpoint_url is required.");
                return;
            }
            call.resolve(databaseHelper.removeWorkspaceSyncRememberedTarget(endpointUrl));
        } catch (Exception exception) {
            call.reject("Failed to remove companion workspace sync target.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadReadableArticle(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadReadableArticle());
        } catch (Exception exception) {
            call.reject("Failed to load companion readable article.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncIndex(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncIndex());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync index.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncNodeConflicts(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncNodeConflicts());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync node conflicts.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncStateChanges(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                ? call.getData().getInt("cursor")
                : null;
            call.resolve(databaseHelper.loadSyncStateChanges(cursor, call.getData().optInt("limit", 500)));
        } catch (Exception exception) {
            call.reject("Failed to load companion sync state changes.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncStateCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncStateCursor());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync state cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncStateCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                ? call.getData().getInt("cursor")
                : null;
            call.resolve(databaseHelper.saveSyncStateCursor(cursor));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync state cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncPackCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncPackCursor());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync pack cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncPackCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                ? call.getData().getInt("cursor")
                : null;
            call.resolve(databaseHelper.saveSyncPackCursor(cursor));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync pack cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncStatePushCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncStatePushCursor());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync state push cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncStatePushCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            Integer cursor = call.getData().has("cursor") && !call.getData().isNull("cursor")
                ? call.getData().getInt("cursor")
                : null;
            call.resolve(databaseHelper.saveSyncStatePushCursor(cursor));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync state push cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncNodeVersionCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncNodeVersionCursor());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync node version cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncNodeVersionCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncNodeVersionCursor(call.getData().optJSONObject("cursor")));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync node version cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncNodeVersionPushCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncNodeVersionPushCursor());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync node version push cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncNodeVersionPushCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncNodeVersionPushCursor(call.getData().optJSONObject("cursor")));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync node version push cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncReviewLogCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncReviewLogCursor());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync review log cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncReviewLogCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncReviewLogCursor(call.getData().optJSONObject("cursor")));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync review log cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncReviewLogPushCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncReviewLogPushCursor());
        } catch (Exception exception) {
            call.reject("Failed to load companion sync review log push cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncReviewLogPushCursor(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncReviewLogPushCursor(call.getData().optJSONObject("cursor")));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync review log push cursor.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncSettingRecord(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncSettingRecord(call.getData()));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync setting record.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncNodeReadingRecord(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncNodeReadingRecord(call.getData()));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync node reading record.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncNodeReviewRecord(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncNodeReviewRecord(call.getData()));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync node review record.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncActiveViewState(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncActiveViewState(call.getData()));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync active view state.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void saveSyncNodeViewState(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.saveSyncNodeViewState(call.getData()));
        } catch (Exception exception) {
            call.reject("Failed to save companion sync node view state.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncObjects(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncObjects(
                call.getData().optJSONArray("object_ids"),
                call.getData().optJSONArray("object_types")
            ));
        } catch (Exception exception) {
            call.reject("Failed to load companion sync objects.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void applySyncObjects(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.applySyncObjects(call.getData().optJSONArray("objects")));
        } catch (Exception exception) {
            call.reject("Failed to apply companion sync objects.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void applySyncPack(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            String packPath = call.getString("pack_path");
            if (packPath == null || packPath.trim().isEmpty()) {
                call.reject("pack_path is required.");
                return;
            }
            call.resolve(databaseHelper.applySyncPack(packPath.trim()));
        } catch (Exception exception) {
            call.reject("Failed to apply companion sync pack.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void applyDesktopSyncPack(PluginCall call) {
        new Thread(() -> {
            FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
            try {
                String url = call.getString("url");
                if (url == null || url.trim().isEmpty()) {
                    call.reject("url is required.");
                    return;
                }
                call.resolve(databaseHelper.applyDesktopSyncPack(
                    url.trim(),
                    call.getData().optJSONObject("headers")
                ));
            } catch (Exception exception) {
                call.reject("Failed to apply companion desktop sync pack.", exception);
            } finally {
                databaseHelper.close();
            }
        }).start();
    }

    @PluginMethod
    public void loadSyncNodeVersions(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncNodeVersions(
                call.getData().optJSONObject("cursor"),
                call.getData().optInt("limit", 500)
            ));
        } catch (Exception exception) {
            call.reject("Failed to load companion sync node versions.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void loadSyncReviewLog(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadSyncReviewLog(
                call.getData().optJSONObject("cursor"),
                call.getData().optInt("limit", 500)
            ));
        } catch (Exception exception) {
            call.reject("Failed to load companion sync review log.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void applySyncNodeVersions(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.applySyncNodeVersions(call.getData().optJSONArray("nodes")));
        } catch (Exception exception) {
            call.reject("Failed to apply companion sync node versions.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void applySyncReviewLog(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.applySyncReviewLog(call.getData().optJSONArray("reviews")));
        } catch (Exception exception) {
            call.reject("Failed to apply companion sync review log.", exception);
        } finally {
            databaseHelper.close();
        }
    }
}
