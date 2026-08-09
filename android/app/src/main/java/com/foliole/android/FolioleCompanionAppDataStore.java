package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import java.io.File;

final class FolioleCompanionAppDataStore {
    private FolioleCompanionAppDataStore() {}

    static JSObject clear(Context context) throws Exception {
        deleteRecursively(new File(context.getFilesDir(), "attachments"));
        FolioleCompanionPairingStore.clearPairingCredentials(context);
        FolioleCompanionSyncGroupJoinGrantStore.clear(context);
        FolioleCompanionSyncGroupPeerStore.clear(context);
        FolioleCompanionSyncGroupOutboundPeerStore.clear(context);
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
