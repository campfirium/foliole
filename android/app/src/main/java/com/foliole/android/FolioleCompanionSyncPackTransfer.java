package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;

final class FolioleCompanionSyncPackTransfer {
    private FolioleCompanionSyncPackTransfer() {}

    static File downloadToCache(Context context, String url, JSONObject headers) throws Exception {
        byte[] body = FolioleCompanionDesktopHttpClient.requestBytes(url, headers);
        File directory = cacheDirectory(context);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Failed to create sync pack cache.");
        }
        File file = new File(directory, UUID.randomUUID() + ".db");
        try (FileOutputStream outputStream = new FileOutputStream(file)) {
            outputStream.write(body);
        }
        return file;
    }

    static boolean deleteCachedPack(Context context, String packPath) throws Exception {
        File directory = cacheDirectory(context).getCanonicalFile();
        File file = new File(packPath).getCanonicalFile();
        File parent = file.getParentFile();
        if (parent == null || !parent.equals(directory) || !file.getName().endsWith(".db")) {
            throw new IllegalArgumentException("pack_path is outside the sync pack cache.");
        }
        return !file.exists() || file.delete();
    }

    private static File cacheDirectory(Context context) {
        return new File(context.getCacheDir(), "sync-packs");
    }
}
