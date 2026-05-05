package com.foliole.android;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends Plugin {

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
    public void replaceWorkspaceSnapshot(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            String endpointUrl = call.getString("endpoint_url");
            String lastSyncedAt = call.getString("last_synced_at");
            String workspaceSnapshotJson = call.getString("workspace_snapshot_json");
            if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
                call.reject("endpoint_url is required.");
                return;
            }
            if (lastSyncedAt == null || lastSyncedAt.trim().isEmpty()) {
                call.reject("last_synced_at is required.");
                return;
            }
            call.resolve(databaseHelper.replaceWorkspaceSnapshot(endpointUrl, lastSyncedAt, workspaceSnapshotJson));
        } catch (Exception exception) {
            call.reject("Failed to replace companion workspace snapshot.", exception);
        } finally {
            databaseHelper.close();
        }
    }

    @PluginMethod
    public void replaceWorkspaceNode(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            String endpointUrl = call.getString("endpoint_url");
            String lastSyncedAt = call.getString("last_synced_at");
            String nodeId = call.getString("node_id");
            String nodeSnapshotJson = call.getString("node_snapshot_json");
            if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
                call.reject("endpoint_url is required.");
                return;
            }
            if (lastSyncedAt == null || lastSyncedAt.trim().isEmpty()) {
                call.reject("last_synced_at is required.");
                return;
            }
            if (nodeId == null || nodeId.trim().isEmpty()) {
                call.reject("node_id is required.");
                return;
            }
            if (nodeSnapshotJson == null || nodeSnapshotJson.trim().isEmpty()) {
                call.reject("node_snapshot_json is required.");
                return;
            }
            call.resolve(databaseHelper.replaceWorkspaceNode(endpointUrl, lastSyncedAt, nodeId.trim(), nodeSnapshotJson));
        } catch (Exception exception) {
            call.reject("Failed to replace companion workspace node.", exception);
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
    public void loadDirtyNodes(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            call.resolve(databaseHelper.loadDirtyNodes());
        } catch (Exception exception) {
            call.reject("Failed to load companion dirty nodes.", exception);
        } finally {
            databaseHelper.close();
        }
    }
}
