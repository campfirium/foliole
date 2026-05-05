package com.foliole.android;

import android.os.Build;

import com.getcapacitor.JSObject;

final class FolioleCompanionBootstrapState {

    private final String bootedAt;
    private final String databasePath;
    private final boolean databaseReady;
    private final String deviceId;
    private final String deviceName;

    FolioleCompanionBootstrapState(String bootedAt, String databasePath, boolean databaseReady, String deviceId) {
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

    JSObject toJsObject() {
        JSObject result = new JSObject();
        result.put("booted_at", bootedAt);
        result.put("database_path", databasePath);
        result.put("database_ready", databaseReady);
        result.put("device_id", deviceId);
        result.put("device_name", deviceName);
        result.put("runtime_kind", "android-capacitor");
        return result;
    }
}
