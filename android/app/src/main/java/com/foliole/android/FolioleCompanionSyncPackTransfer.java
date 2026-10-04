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
        return downloadWithManifestToCache(context, url, headers, expectedPeerId, expectedSourcePeerId).file;
    }

    static ValidatedPack downloadWithManifestToCache(
        Context context, String url, JSONObject headers,
        String expectedPeerId, String expectedSourcePeerId
    ) throws Exception {
        return downloadWithManifestToCache(context, url, headers, expectedPeerId,
            expectedSourcePeerId, "GET", null);
    }

    static ValidatedPack downloadWithManifestToCache(
        Context context, String url, JSONObject headers,
        String expectedPeerId, String expectedSourcePeerId,
        String method, String body
    ) throws Exception {
        if (!("GET".equals(method) && body == null || "POST".equals(method) && body != null)) {
            throw new IllegalArgumentException("sync_pack_request_invalid");
        }
        File directory = ensureCacheDirectory(context);
        File pack = File.createTempFile("sync-pack-download-", ".tmp", directory);
        try {
            if ("GET".equals(method)) {
                FolioleCompanionDesktopHttpClient.downloadToFile(context, url, headers, pack);
            } else {
                byte[] archive = FolioleCompanionDesktopHttpClient.requestBytes(
                    context, url, method, headers, body);
                if (archive.length > FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES) {
                    throw new IllegalArgumentException("sync_pack_transfer_limit_exceeded");
                }
                try (FileOutputStream output = new FileOutputStream(pack)) { output.write(archive); }
            }
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
            return storePackFile(context, pack, expectedPeerId, expectedSourcePeerId).file;
        } finally {
            if (!pack.delete()) pack.deleteOnExit();
        }
    }

    static ValidatedPack storeReceivedArchive(Context context, byte[] body,
            String expectedPeerId, String expectedSourcePeerId) throws Exception {
        if (body.length > FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES) {
            throw new IllegalArgumentException("sync_pack_transfer_limit_exceeded");
        }
        File pack = File.createTempFile("sync-pack-received-", ".tmp", ensureCacheDirectory(context));
        try {
            try (FileOutputStream output = new FileOutputStream(pack)) { output.write(body); }
            return storePackFile(context, pack, expectedPeerId, expectedSourcePeerId);
        } finally {
            if (!pack.delete()) pack.deleteOnExit();
        }
    }

    private static ValidatedPack storePackFile(
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
            return new ValidatedPack(file, envelope.manifest);
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

    static final class ValidatedPack {
        final File file;
        final JSONObject manifest;

        ValidatedPack(File file, JSONObject manifest) {
            this.file = file;
            this.manifest = manifest;
        }
    }

}
