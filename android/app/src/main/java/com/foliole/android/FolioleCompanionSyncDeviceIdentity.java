package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import java.io.File;

final class FolioleCompanionSyncDeviceIdentity {
    private FolioleCompanionSyncDeviceIdentity() {}

    static JSObject load(Context context, String databasePath) throws Exception {
        if (databasePath == null || databasePath.isEmpty()) {
            throw new IllegalArgumentException("database_path_required");
        }
        return new JSObject()
            .put("canonical_library_path", FolioleCompanionDeviceAnchorStore
                .canonicalLibraryPath(new File(databasePath)))
            .put("device_anchor", FolioleCompanionDeviceAnchorStore.loadOrCreate(context))
            .put("device_name", android.os.Build.MODEL)
            .put("path_flavor", "posix")
            .put("platform", "android-capacitor");
    }
}
