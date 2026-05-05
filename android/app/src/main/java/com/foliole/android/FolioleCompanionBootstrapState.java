package com.foliole.android;

import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;

final class FolioleCompanionBootstrapState {

    private final String bootedAt;
    private final String databasePath;
    private final boolean databaseReady;
    private final String deviceId;
    private final String deviceName;
    private final Context context;

    FolioleCompanionBootstrapState(Context context, String bootedAt, String databasePath, boolean databaseReady, String deviceId) {
        this.context = context;
        this.bootedAt = bootedAt;
        this.databasePath = databasePath;
        this.databaseReady = databaseReady;
        this.deviceId = deviceId;
        this.deviceName = resolveDeviceName();
    }

    private String resolveDeviceName() {
        String model = Build.MODEL == null ? "" : Build.MODEL.trim();
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        if (model.isEmpty()) {
            return "Android device";
        }
        String normalizedModel = model.toLowerCase();
        if (normalizedModel.contains("sdk") || normalizedModel.contains("gphone") || normalizedModel.contains("emulator")) {
            return "Android Emulator";
        }
        if (!manufacturer.isEmpty() && !normalizedModel.startsWith(manufacturer.toLowerCase())) {
            return manufacturer + " " + model;
        }
        return model;
    }

    JSObject toJsObject() throws Exception {
        JSObject result = new JSObject();
        result.put(FolioleCompanionHostBridgeContractDefinitions.bootstrapBootedAtOutputKey(context), bootedAt);
        result.put(FolioleCompanionHostBridgeContractDefinitions.bootstrapDatabasePathOutputKey(context), databasePath);
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
