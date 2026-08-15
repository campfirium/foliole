package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionBootstrapState {
    private static final String IDENTITY_PREFERENCES = "foliole_companion_identity";
    private static final String DEVICE_ID_KEY = "device_id";

    private final String bootedAt;
    private final String databasePath;
    private final boolean databaseReady;
    private final String deviceId;
    private final String deviceName;
    private final Context context;

    FolioleCompanionBootstrapState(Context context, String bootedAt, String databasePath, boolean databaseReady, String deviceId) throws Exception {
        this.context = context;
        this.bootedAt = bootedAt;
        this.databasePath = databasePath;
        this.databaseReady = databaseReady;
        this.deviceId = deviceId;
        this.deviceName = resolveDeviceName(context);
    }

    static String loadDeviceId(Context context) throws Exception {
        String current = resolveDeviceName(context);
        SharedPreferences preferences = context.getSharedPreferences(IDENTITY_PREFERENCES, Context.MODE_PRIVATE);
        if (!preferences.edit().remove(DEVICE_ID_KEY).commit()) {
            throw new IllegalStateException("Failed to retire legacy companion device identity.");
        }
        return current;
    }

    private static String resolveDeviceName(Context context) throws Exception {
        String model = Build.MODEL == null ? "" : Build.MODEL.trim();
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        if (model.isEmpty()) {
            return FolioleCompanionHostBridgeContractDefinitions.bootstrapDefaultDeviceName(context);
        }
        String normalizedModel = model.toLowerCase();
        JSONArray emulatorTokens = FolioleCompanionHostBridgeContractDefinitions.bootstrapEmulatorModelTokens(context);
        for (int index = 0; index < emulatorTokens.length(); index += 1) {
            if (normalizedModel.contains(emulatorTokens.getString(index))) {
                return FolioleCompanionHostBridgeContractDefinitions.bootstrapEmulatorDeviceName(context);
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
        result.put(FolioleCompanionHostBridgeContractDefinitions.bootstrapDeviceIdOutputKey(context), deviceId);
        result.put(FolioleCompanionHostBridgeContractDefinitions.bootstrapDeviceNameOutputKey(context), deviceName);
        result.put(
            FolioleCompanionHostBridgeContractDefinitions.bootstrapRuntimeKindOutputKey(context),
            FolioleCompanionHostBridgeContractDefinitions.bootstrapRuntimeKind(context)
        );
        return result;
    }
}
