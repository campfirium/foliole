package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import java.io.File;

final class FolioleCompanionAppDataStore {
    private FolioleCompanionAppDataStore() {}

    static JSObject clear(Context context) throws Exception {
        deleteRecursively(new File(context.getFilesDir(), "attachments"));
        context.getSharedPreferences("foliole_workgroup_request_nonces", Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("foliole_workgroup_response_nonces", Context.MODE_PRIVATE).edit().clear().commit();
        return new JSObject();
    }

    private static void deleteRecursively(File file) {
        if (!file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursively(child);
            }
        }
        if (!file.delete()) file.deleteOnExit();
    }
}
