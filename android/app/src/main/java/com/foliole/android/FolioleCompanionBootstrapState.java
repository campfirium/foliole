package com.foliole.android;

import com.getcapacitor.JSObject;

final class FolioleCompanionBootstrapState {

    private final String bootedAt;
    private final String databasePath;
    private final boolean databaseReady;
    private final String deviceId;

    FolioleCompanionBootstrapState(String bootedAt, String databasePath, boolean databaseReady, String deviceId) {
        this.bootedAt = bootedAt;
        this.databasePath = databasePath;
        this.databaseReady = databaseReady;
        this.deviceId = deviceId;
    }

    JSObject toJsObject() {
        JSObject result = new JSObject();
        result.put("booted_at", bootedAt);
        result.put("database_path", databasePath);
        result.put("database_ready", databaseReady);
        result.put("device_id", deviceId);
        result.put("runtime_kind", "android-capacitor");
        return result;
    }
}
