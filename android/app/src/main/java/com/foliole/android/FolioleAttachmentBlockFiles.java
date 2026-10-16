package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

/** Native file operations only; recovery and transfer decisions stay in the shared receiver. */
public final class FolioleAttachmentBlockFiles {
    private static final Map<FramedSyncPayloadBudget, FolioleAttachmentBlockFiles> OWNERS = new HashMap<>();
    private final File root;
    private final Context context;
    private final Map<String, RandomAccessFile> sources = new HashMap<>();
    private RandomAccessFile carrier;
    private FileLock lock;

    private FolioleAttachmentBlockFiles(Context context) throws Exception {
        this.context = context;
        root = FolioleAttachmentMaintenanceFiles.directory(context, false).getCanonicalFile();
        Files.createDirectories(root.toPath());
    }

    static synchronized JSObject access(Context context, FramedSyncPayloadBudget owner, PluginCall call) throws Exception {
        if (owner.isClosed()) throw new IllegalStateException("attachment_owner_closed");
        FolioleAttachmentBlockFiles files = OWNERS.get(owner);
        if (files == null) {
            files = new FolioleAttachmentBlockFiles(context); OWNERS.put(owner, files);
            owner.onAttachmentClose(() -> close(owner));
        }
        if (owner.isClosed()) throw new IllegalStateException("attachment_owner_closed");
        return files.execute(call);
    }

    public static synchronized void close(FramedSyncPayloadBudget owner) {
        FolioleAttachmentBlockFiles files = OWNERS.remove(owner);
        if (files == null) return;
        for (RandomAccessFile source : files.sources.values()) closeFile(source);
        files.sources.clear();
        if (files.carrier != null) closeFile(files.carrier);
    }
    private static void closeFile(RandomAccessFile file) {
        try { file.close(); } catch (Exception error) { android.util.Log.e("Foliole", "Attachment file close failed", error); }
    }

    private void acquire() throws Exception {
        if (lock != null && lock.isValid()) return;
        RandomAccessFile candidate = new RandomAccessFile(new File(root, ".attachment-receiver.lock"), "rw");
        try {
            FileLock acquired;
            try { acquired = candidate.getChannel().tryLock(); }
            catch (OverlappingFileLockException busy) { throw new IllegalStateException("attachment_receiver_busy", busy); }
            if (acquired == null) throw new IllegalStateException("attachment_receiver_busy");
            carrier = candidate; lock = acquired;
        } finally { if (carrier != candidate) candidate.close(); }
    }

    private JSObject execute(PluginCall call) throws Exception {
        String action = call.getString("action", "");
        String key = call.getString("key", "");
        if (action.equals("source-stat-batch")) return sourceStatBatch(call);
        if (action.equals("acquire")) { acquire(); return new JSObject(); }
        if (action.startsWith("source-")) return source(call, action, key);
        boolean partial = call.getBoolean("partial", false);
        if (action.equals("stat")) return info(resolve(key, partial), !partial);
        if (action.equals("hash")) return new JSObject().put("hash", digest(resolve(key, partial)));
        acquire();
        return mutate(call, action, key);
    }

    private JSObject sourceStatBatch(PluginCall call) throws Exception {
        JSArray keys = call.getArray("keys");
        if (keys == null || keys.length() > 64) throw new IllegalArgumentException("attachment_stat_batch_invalid");
        int bytes = 0;
        for (int i = 0; i < keys.length(); i++) {
            if (!(keys.get(i) instanceof String)) throw new IllegalArgumentException("attachment_stat_batch_invalid");
            bytes += keys.getString(i).getBytes(StandardCharsets.UTF_8).length;
            if (bytes > 16384) throw new IllegalArgumentException("attachment_stat_batch_invalid");
            resolve(keys.getString(i), false);
        }
        JSArray presence = new JSArray();
        for (int i = 0; i < keys.length(); i++) presence.put(source(call, "source-stat", keys.getString(i)).getBoolean("present"));
        return new JSObject().put("presence", presence);
    }

    private JSObject mutate(PluginCall call, String action, String key) throws Exception {
        File file = resolve(key, true);
        if (action.equals("discard")) Files.deleteIfExists(file.toPath());
        else if (action.equals("publish")) {
            publish(context, file, resolve(key, false), key.substring(0, 64));
        } else try (RandomAccessFile output = new RandomAccessFile(file, "rw")) {
            if (action.equals("truncate")) output.setLength(number(call, "length"));
            else if (action.equals("append")) {
                long offset = number(call, "offset");
                byte[] bytes = Base64.decode(call.getString("base64", ""), Base64.NO_WRAP);
                if (bytes.length > 524288 || output.length() != offset) throw new IllegalArgumentException("attachment_block_range_invalid");
                output.seek(offset); output.write(bytes);
            } else throw new IllegalArgumentException("attachment_operation_invalid");
        }
        return new JSObject();
    }

    private JSObject source(PluginCall call, String action, String key) throws Exception {
        if (action.equals("source-open") || action.equals("source-stat")) {
            if (action.equals("source-open") && sources.containsKey(key)) throw new IllegalStateException("attachment_send_busy");
            File file = resolve(key, false);
            if (!file.exists()) file = new File(FolioleAttachmentMaintenanceFiles.directory(context, true), key);
            if (action.equals("source-stat")) return info(file, false);
            JSObject result = info(file, true);
            if (file.exists()) sources.put(key, new RandomAccessFile(file, "r"));
            return result;
        }
        RandomAccessFile source = sources.get(key);
        if (action.equals("source-close")) {
            if (source != null) { sources.remove(key); source.close(); }
            return new JSObject();
        }
        if (!action.equals("source-read") || source == null) throw new IllegalStateException("attachment_send_missing");
        long offset = number(call, "offset"), length = number(call, "length");
        if (length > 524288 || offset + length > source.length()) throw new IllegalArgumentException("attachment_source_range_invalid");
        byte[] bytes = new byte[(int) length]; source.seek(offset); source.readFully(bytes);
        return new JSObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
    }

    static synchronized boolean publish(Context context, File source, File target, String hash) throws Exception {
        File directory = FolioleAttachmentMaintenanceFiles.directory(context, false).getCanonicalFile();
        for (FolioleAttachmentBlockFiles owner : OWNERS.values()) {
            if (owner.root.equals(directory) && owner.lock != null && owner.lock.isValid()) {
                return FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash);
            }
        }
        FolioleAttachmentBlockFiles temporary = new FolioleAttachmentBlockFiles(context);
        try {
            temporary.acquire();
            return FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash);
        } finally { if (temporary.carrier != null) temporary.carrier.close(); }
    }

    static synchronized void requireNotSending(String key) {
        for (FolioleAttachmentBlockFiles files : OWNERS.values()) {
            if (files.sources.containsKey(key)) throw new IllegalStateException("attachment_send_busy");
        }
    }
    static synchronized <T> T withRemoval(String key, java.util.concurrent.Callable<T> execute) throws Exception {
        requireNotSending(key);
        return execute.call();
    }

    private File resolve(String key, boolean partial) throws Exception {
        if (!(partial ? key.matches("[a-f0-9]{64}(\\.(png|jpg|gif|webp|pdf|epub))?")
            : FolioleCompanionCanonicalAttachmentKey.valid(key))) throw new IllegalArgumentException("attachment_key_invalid");
        File file = new File(root, partial ? ".attachment-" + key.substring(0, 64) + ".partial" : key);
        if (!file.getCanonicalPath().equals(file.getAbsolutePath())) throw new IllegalArgumentException("attachment_file_unsafe");
        return file;
    }
    private JSObject info(File file, boolean hash) throws Exception {
        if (!file.exists()) return new JSObject().put("present", false).put("length", 0).put("hash", "");
        file = checkedSourceFile(file);
        return new JSObject().put("present", true).put("length", file.length()).put("hash", hash ? digest(file) : "");
    }
    static File checkedSourceFile(File file) throws Exception {
        file = new File(file.getParentFile().getCanonicalFile(), file.getName());
        if (!file.isFile() || !file.getCanonicalPath().equals(file.getAbsolutePath())) {
            throw new IllegalArgumentException("attachment_file_unsafe");
        }
        return file;
    }
    private String digest(File file) throws Exception { return FolioleCompanionAttachmentResourceHash.digestHex(context, file); }
    private static long number(PluginCall call, String name) {
        Double value = call.getDouble(name);
        if (value == null || !Double.isFinite(value) || value < 0 || value > 8589934592L || value != Math.floor(value)) {
            throw new IllegalArgumentException("attachment_range_invalid");
        }
        return value.longValue();
    }
}
