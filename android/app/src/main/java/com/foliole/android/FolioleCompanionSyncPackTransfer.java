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
        File directory = new File(context.getCacheDir(), "sync-packs");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Failed to create sync pack cache.");
        }
        File file = new File(directory, UUID.randomUUID() + ".db");
        try (FileOutputStream outputStream = new FileOutputStream(file)) {
            outputStream.write(body);
        }
        return file;
    }
}
