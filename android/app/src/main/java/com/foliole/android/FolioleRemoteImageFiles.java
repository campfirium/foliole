package com.foliole.android;

import android.content.Context;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

final class FolioleRemoteImageFiles {
    private static final int MAX_BYTES = 32 * 1024 * 1024;
    private FolioleRemoteImageFiles() {}

    static JSObject read(PluginCall call) throws Exception {
        URL url = new URL(required(call, "url"));
        if (!(url.getProtocol().equals("https") || url.getProtocol().equals("http")) || url.getUserInfo() != null) {
            throw new IllegalArgumentException("Invalid image URL");
        }
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        try {
            if (BuildConfig.DEBUG) android.util.Log.d("FolioleImage", "readRemoteImageResponse");
            int status = connection.getResponseCode();
            JSObject result = new JSObject().put("status", status);
            String location = connection.getHeaderField("Location");
            if (location != null) result.put("location", location);
            if (status >= 200 && status < 300) {
                if (connection.getContentLengthLong() > MAX_BYTES) throw new IllegalArgumentException("Image too large");
                try (InputStream stream = connection.getInputStream()) {
                    result.put("bytesBase64", Base64.encodeToString(readBounded(stream), Base64.NO_WRAP));
                }
            }
            return result;
        } finally { connection.disconnect(); }
    }

    static JSObject write(Context context, PluginCall call) throws Exception {
        byte[] bytes = Base64.decode(required(call, "bytesBase64"), Base64.DEFAULT);
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("Invalid image size");
        String hash = required(call, "contentHash");
        String key = required(call, "storageKey");
        if (!FolioleCompanionCanonicalAttachmentKey.matches(hash, required(call, "mimeType"), key)
            || !hash.equals(digest(bytes))) throw new IllegalArgumentException("Invalid image identity");
        File root = new File(context.getFilesDir(), "attachments");
        if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("Image directory unavailable");
        File target = new File(root, key);
        try {
            if (OsConstants.S_ISLNK(Os.lstat(target.getPath()).st_mode)) {
                throw new IllegalArgumentException("Image path is a symbolic link");
            }
        } catch (ErrnoException error) {
            if (error.errno != OsConstants.ENOENT) throw error;
        }
        if (target.exists()) {
            if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, target))) {
                throw new IllegalArgumentException("Existing image differs");
            }
            return new JSObject().put("storedFile", "reused");
        }
        File temporary = File.createTempFile("image-", ".part", root);
        try {
            try (FileOutputStream stream = new FileOutputStream(temporary)) { stream.write(bytes); stream.getFD().sync(); }
            Os.link(temporary.getPath(), target.getPath());
        } finally { temporary.delete(); }
        return new JSObject().put("storedFile", "created");
    }

    private static byte[] readBounded(InputStream stream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            if (output.size() + count > MAX_BYTES) throw new IllegalArgumentException("Image too large");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static String digest(byte[] bytes) throws Exception {
        StringBuilder value = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format("%02x", item));
        return value.toString();
    }

    private static String required(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException(name + " is required");
        return value;
    }
}
