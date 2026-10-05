package com.foliole.android;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncResources {
    private FolioleCompanionFramedSyncResources() {}

    static JSONArray describe(Context context, JSONObject inspected) throws Exception {
        JSONArray keys = inspected.getJSONArray("resource_storage_keys");
        JSONArray result = new JSONArray();
        File directory = new File(context.getApplicationContext().getFilesDir(), "attachments");
        for (int index = 0; index < keys.length(); index++) {
            String key = keys.getString(index);
            File file = requireVerifiedFile(directory, key);
            result.put(new JSONObject().put("storage_key", key)
                .put("byte_length", Long.toString(file.length())));
        }
        return result;
    }

    static File resolveFile(Context context, String storageKey) {
        return resolveFile(new File(context.getApplicationContext().getFilesDir(), "attachments"),
            storageKey);
    }

    private static File requireVerifiedFile(File directory, String storageKey) throws Exception {
        File file = resolveFile(directory, storageKey);
        if (!MessageDigest.isEqual(digest(storageKey.substring(0, 64)), sha256(file))) {
            throw new IllegalArgumentException("framed_sync_outbound_resource_unavailable");
        }
        return file;
    }

    private static File resolveFile(File directory, String storageKey) {
        if (!FolioleCompanionCanonicalAttachmentKey.valid(storageKey)) {
            throw new IllegalArgumentException("framed_sync_outbound_resource_key_invalid");
        }
        File file = new File(directory, storageKey);
        if (!file.isFile()) {
            throw new IllegalArgumentException("framed_sync_outbound_resource_unavailable");
        }
        return file;
    }

    private static byte[] sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        try (InputStream input = new FileInputStream(file)) {
            for (int length; (length = input.read(buffer)) >= 0;) {
                if (length > 0) digest.update(buffer, 0, length);
            }
        }
        return digest.digest();
    }

    private static byte[] digest(String value) {
        byte[] result = new byte[32];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }
}
