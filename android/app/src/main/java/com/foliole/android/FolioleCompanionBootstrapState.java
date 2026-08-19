package com.foliole.android;

import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionBootstrapState {
    private final String bootedAt;
    private final String databasePath;
    private final boolean databaseReady;
    private final String hostName;
    private final Context context;

    FolioleCompanionBootstrapState(Context context, String bootedAt, String databasePath, boolean databaseReady) throws Exception {
        this.context = context;
        this.bootedAt = bootedAt;
        this.databasePath = databasePath;
        this.databaseReady = databaseReady;
        this.hostName = resolveHostName(context);
    }

    private static String resolveHostName(Context context) throws Exception {
        String model = Build.MODEL == null ? "" : Build.MODEL.trim();
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        if (model.isEmpty()) {
            return FolioleCompanionHostBridgeContractDefinitions.bootstrapDefaultHostName(context);
        }
        String normalizedModel = model.toLowerCase();
        JSONArray emulatorTokens = FolioleCompanionHostBridgeContractDefinitions.bootstrapEmulatorModelTokens(context);
        for (int index = 0; index < emulatorTokens.length(); index += 1) {
            if (normalizedModel.contains(emulatorTokens.getString(index))) {
                return FolioleCompanionHostBridgeContractDefinitions.bootstrapEmulatorHostName(context);
            }
        }
        if (!manufacturer.isEmpty() && !normalizedModel.startsWith(manufacturer.toLowerCase())) {
            return manufacturer + " " + model;
        }
        return model;
    }

    private static String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        return value.trim();
    }

    JSObject toJsObject() throws Exception {
        JSObject result = new JSObject();
        result.put(FolioleCompanionHostBridgeContractDefinitions.bootstrapBootedAtOutputKey(context), bootedAt);
        result.put(
            FolioleCompanionHostBridgeContractDefinitions.bootstrapDatabasePathOutputKey(context),
            databasePath == null ? JSONObject.NULL : databasePath
        );
        result.put(FolioleCompanionHostBridgeContractDefinitions.bootstrapDatabaseReadyOutputKey(context), databaseReady);
        result.put(FolioleCompanionHostBridgeContractDefinitions.bootstrapHostNameOutputKey(context), hostName);
        result.put(
            FolioleCompanionHostBridgeContractDefinitions.bootstrapRuntimeKindOutputKey(context),
            FolioleCompanionHostBridgeContractDefinitions.bootstrapRuntimeKind(context)
        );
        return result;
    }
}
