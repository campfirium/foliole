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
        byte[] body = FolioleCompanionDesktopHttpClient.requestBytes(context, url, headers);
        return storeDownloadedPack(context, body, expectedPeerId, expectedSourcePeerId);
    }

    static File storeDownloadedPack(Context context, byte[] body) throws Exception {
        return storeDownloadedPack(
            context,
            body,
            FolioleCompanionPairingStore.loadPairedDeviceId(context),
            FolioleCompanionPairingStore.loadPairingState(context).optString("remote_peer_id")
        );
    }

    static File storeDownloadedPack(
        Context context,
        byte[] body,
        String expectedPeerId,
        String expectedSourcePeerId
    ) throws Exception {
        FolioleCompanionSyncPackContract contract = FolioleCompanionSyncPackContract.load(context);
        FolioleCompanionSyncPackEnvelopeValidator.PreparedEnvelope envelope =
            FolioleCompanionSyncPackEnvelopeValidator.validate(
                body,
                contract,
                expectedPeerId,
                expectedSourcePeerId
            );
        File directory = cacheDirectory(context);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Failed to create sync pack cache.");
        }
        File file = new File(directory, UUID.randomUUID() + ".db");
        try {
            try (FileOutputStream outputStream = new FileOutputStream(file)) {
                outputStream.write(envelope.databaseBytes);
            }
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

    private static File cacheDirectory(File cacheRoot) {
        return new File(cacheRoot, "sync-packs");
    }

}
