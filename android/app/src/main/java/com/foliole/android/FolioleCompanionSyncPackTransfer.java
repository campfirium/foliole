package com.foliole.android;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;

import org.json.JSONObject;

final class FolioleCompanionSyncPackTransfer {
    private FolioleCompanionSyncPackTransfer() {}

    static File downloadToCache(
        Context context,
        String url,
        JSONObject headers,
        String expectedPeerId,
        String expectedSourcePeerId
    ) throws Exception {
        File directory = ensureCacheDirectory(context);
        File pack = File.createTempFile("sync-pack-download-", ".tmp", directory);
        try {
            FolioleCompanionDesktopHttpClient.downloadSyncPackToFile(context, url, headers, pack);
            return storePackFile(context, pack, expectedPeerId, expectedSourcePeerId);
        } finally {
            if (!pack.delete()) pack.deleteOnExit();
        }
    }

    static File storeDownloadedPack(
        Context context,
        byte[] body,
        String expectedPeerId,
        String expectedSourcePeerId
    ) throws Exception {
        File pack = File.createTempFile("sync-pack-fixture-", ".tmp", ensureCacheDirectory(context));
        try {
            try (FileOutputStream output = new FileOutputStream(pack)) { output.write(body); }
            return storePackFile(context, pack, expectedPeerId, expectedSourcePeerId);
        } finally {
            if (!pack.delete()) pack.deleteOnExit();
        }
    }

    private static File storePackFile(
        Context context, File pack, String expectedPeerId, String expectedSourcePeerId
    ) throws Exception {
        File directory = ensureCacheDirectory(context);
        File file = new File(directory, UUID.randomUUID() + ".db");
        try {
            FolioleCompanionSyncPackEnvelopeValidator.PreparedEnvelope envelope =
                FolioleCompanionSyncPackFileValidator.validate(
                    pack, file, FolioleCompanionSyncPackContract.load(context),
                    expectedPeerId, expectedSourcePeerId);
            FolioleCompanionSyncPackDatabaseValidator.validate(file, envelope);
            return file;
        } catch (Exception exception) {
            if (file.exists() && !file.delete()) file.deleteOnExit();
            throw exception;
        }
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
        return cacheDirectory(context.getCacheDir());
    }

    private static File ensureCacheDirectory(Context context) {
        File directory = cacheDirectory(context);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Failed to create sync pack cache.");
        }
        return directory;
    }

    private static File cacheDirectory(File cacheRoot) {
        return new File(cacheRoot, "sync-packs");
    }

}
