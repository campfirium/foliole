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
        return databaseHelper.saveWorkspaceSyncEndpoint(call.getString("endpoint_url"));
    }

    static JSObject recordWorkspaceSyncEvent(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.recordWorkspaceSyncEvent(
            call.getString("endpoint_url"),
            call.getString("status"),
            call.getString("message"),
            call.getString("occurred_at")
        );
    }

    static JSObject saveSyncOnboardingStatus(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncOnboardingStatus(call.getString("status"));
    }

    static JSObject removeWorkspaceSyncRememberedTarget(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        String endpointUrl = call.getString("endpoint_url");
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            throw new IllegalArgumentException("endpoint_url is required.");
        }
        return databaseHelper.removeWorkspaceSyncRememberedTarget(endpointUrl);
    }
}
