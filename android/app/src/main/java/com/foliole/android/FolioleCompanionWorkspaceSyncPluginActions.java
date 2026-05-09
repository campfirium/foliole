package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionWorkspaceSyncPluginActions {
    private FolioleCompanionWorkspaceSyncPluginActions() {}

    static JSObject diagnoseSync(Context context, FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionSyncDiagnostics.diagnose(
            context,
            databaseHelper.getReadableDatabase(),
            context.getDatabasePath(FolioleCompanionDatabaseHelper.DATABASE_NAME).getAbsolutePath()
        );
    }

    static JSObject saveWorkspaceSyncEndpoint(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveWorkspaceSyncEndpoint(
            call.getString(FolioleCompanionHostBridgeContractDefinitions.workspaceSyncEndpointUrlRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject recordWorkspaceSyncEvent(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        Context context = databaseHelper.hostContext();
        return databaseHelper.recordWorkspaceSyncEvent(
            call.getString(FolioleCompanionHostBridgeContractDefinitions.workspaceSyncEndpointUrlRequestKey(context)),
            call.getString(FolioleCompanionHostBridgeContractDefinitions.workspaceSyncStatusRequestKey(context)),
            call.getString(FolioleCompanionHostBridgeContractDefinitions.workspaceSyncMessageRequestKey(context)),
            call.getString(FolioleCompanionHostBridgeContractDefinitions.workspaceSyncOccurredAtRequestKey(context)),
            call.getString("kind"),
            call.getString("result"),
            call.getString("run_id"),
            call.getString("started_at"),
            call.getData().optJSONObject("summary")
        );
    }

    static JSObject saveSyncOnboardingStatus(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncOnboardingStatus(
            call.getString(FolioleCompanionHostBridgeContractDefinitions.workspaceSyncStatusRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject removeWorkspaceSyncRememberedTarget(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        String endpointUrlKey = FolioleCompanionHostBridgeContractDefinitions.workspaceSyncEndpointUrlRequestKey(
            databaseHelper.hostContext()
        );
        String endpointUrl = call.getString(endpointUrlKey);
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            throw new IllegalArgumentException(endpointUrlKey + " is required.");
        }
        return databaseHelper.removeWorkspaceSyncRememberedTarget(endpointUrl);
    }
}
