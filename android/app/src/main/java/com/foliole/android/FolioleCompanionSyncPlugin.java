package com.foliole.android;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionSync")
public class FolioleCompanionSyncPlugin extends Plugin {

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
}
