package com.foliole.android;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.UUID;

final class FolioleResourceProviderFixture implements AutoCloseable {
    static final int BLOCK_BYTES = 524288;
    final File root;
    final Context context;
    FramedSyncPayloadBudget owner;

    FolioleResourceProviderFixture(Context target) throws Exception {
        root = Files.createTempDirectory(target.getCacheDir().toPath(), "current-attachment-")
            .toFile().getCanonicalFile();
        context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return root; }
            @Override public File getCacheDir() { return root; }
        };
        Files.createDirectory(new File(root, "attachments").toPath());
        owner = newOwner();
    }

    private FramedSyncPayloadBudget newOwner() {
        return new FramedSyncPayloadBudget(new File(root, "fixture.db").getPath(), UUID.randomUUID().toString());
    }

    void reopen() {
        owner.cancel();
        owner = newOwner();
    }

    JSObject access(String action, String key) throws Exception {
        return access(action, key, new JSObject());
    }

    JSObject access(String action, String key, JSObject data) throws Exception {
        return access(owner, action, key, data);
    }

    JSObject access(FramedSyncPayloadBudget selected, String action, String key, JSObject data) throws Exception {
        data.put("action", action).put("key", key);
        PluginCall call = new PluginCall(null, "FolioleCompanionSync", "current-attachment",
            "accessFramedSyncFile", data);
        return FolioleAttachmentBlockFiles.access(context, selected, call);
    }

    void truncate(String key, long length) throws Exception {
        access("truncate", key, new JSObject().put("length", (double) length));
    }

    void append(String key, long offset, byte[] bytes) throws Exception {
        appendEncoded(key, offset, Base64.encodeToString(bytes, Base64.NO_WRAP));
    }

    void appendEncoded(String key, long offset, String encoded) throws Exception {
        access("append", key, new JSObject().put("offset", (double) offset).put("base64", encoded));
    }

    JSObject read(String key, double offset, double length) throws Exception {
        return access("source-read", key, new JSObject().put("offset", offset).put("length", length));
    }

    byte[] readBytes(String key, long offset, int length) throws Exception {
        return Base64.decode(read(key, offset, length).getString("base64"), Base64.NO_WRAP);
    }

    void appendRange(String key, byte[] bytes, int start, int end) throws Exception {
        for (int offset = start; offset < end; offset += BLOCK_BYTES) {
            append(key, offset, Arrays.copyOfRange(bytes, offset, Math.min(end, offset + BLOCK_BYTES)));
        }
    }

    void replacePartial(String key, byte[] bytes) throws Exception {
        truncate(key, 0);
        appendRange(key, bytes, 0, bytes.length);
    }

    File published(String key) { return new File(root, "attachments/" + key); }
    File partial(String key) { return new File(root, "attachments/.attachment-" + key.substring(0, 64) + ".partial"); }

    String createLargeSource(int blockCount) throws Exception {
        File source = new File(root, "source");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] block = new byte[BLOCK_BYTES];
        try (FileOutputStream output = new FileOutputStream(source)) {
            for (int index = 0; index < blockCount; index++) {
                Arrays.fill(block, (byte) index);
                for (int shift = 0; shift < 4; shift++) block[shift] = (byte) (index >>> (shift * 8));
                digest.update(block);
                output.write(block);
            }
        }
        String key = hex(digest.digest()) + ".pdf";
        Files.move(source.toPath(), published(key).toPath());
        return key;
    }

    static String key(byte[] bytes) throws Exception {
        return hex(MessageDigest.getInstance("SHA-256").digest(bytes)) + ".pdf";
    }

    static byte[] sample(int length) {
        byte[] bytes = new byte[length];
        for (int index = 0; index < length; index++) bytes[index] = (byte) (index * 31 + index / BLOCK_BYTES);
        return bytes;
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format("%02x", value));
        return result.toString();
    }

    @Override public void close() throws Exception {
        owner.cancel();
        try (var entries = Files.walk(root.toPath())) {
            for (var entry : entries.sorted(Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new)) {
                Files.delete(entry);
            }
        }
    }
}
