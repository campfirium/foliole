package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.AttachmentFileLeases;
import com.foliole.android.framed.AttachmentFileStore;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

/** Bridge arguments stay here; file exclusion and I/O use the JVM-tested native storage. */
public final class FolioleAttachmentBlockFiles {
    private static final Map<FramedSyncPayloadBudget, FolioleAttachmentBlockOwner> OWNERS = new HashMap<>();
    private FolioleAttachmentBlockFiles() {}
    static FolioleAttachmentBlockOwner owner(Context context, FramedSyncPayloadBudget owner) throws Exception {
        synchronized (OWNERS) {
            if (owner.isClosed()) throw new IllegalStateException("attachment_owner_closed");
            FolioleAttachmentBlockOwner files = OWNERS.get(owner);
            if (files == null) {
                files = new FolioleAttachmentBlockOwner(context, owner); OWNERS.put(owner, files);
                owner.onAttachmentClose(() -> close(owner));
            }
            return files;
        }
    }
    static JSObject access(Context context, FramedSyncPayloadBudget owner, PluginCall call) throws Exception {
        FolioleAttachmentBlockOwner files = owner(context, owner);
        try (AutoCloseable use = files.use()) { return execute(context, files, call); }
    }
    public static void close(FramedSyncPayloadBudget owner) {
        FolioleCompanionRequestSyncHttp.cancelOwner(owner);
        FolioleAttachmentBlockOwner files;
        synchronized (OWNERS) { files = OWNERS.remove(owner); }
        if (files != null) try { files.retire(); }
        catch (Exception error) { android.util.Log.e("Foliole", "Attachment owner close failed", error); }
    }
    static FolioleAttachmentReceiveFile receive(Context context, FramedSyncPayloadBudget owner, String key, long offset) throws Exception {
        FolioleAttachmentBlockOwner files = owner(context, owner);
        AutoCloseable use = files.use();
        try { return new FolioleAttachmentReceiveFile(files.store.receive(key, offset, offset, files::check), use); }
        catch (Exception error) { use.close(); throw error; }
    }
    private static JSObject execute(Context context, FolioleAttachmentBlockOwner files, PluginCall call) throws Exception {
        String action = call.getString("action", ""), key = call.getString("key", "");
        if (action.equals("source-stat-batch")) return FolioleAttachmentBlockSources.batch(context, files, call);
        if (action.equals("acquire")) { files.store.acquire(); return new JSObject(); }
        if (action.startsWith("source-")) return FolioleAttachmentBlockSources.access(context, files, call, action, key);
        boolean partial = call.getBoolean("partial", false);
        File file = files.store.resolve(key, partial);
        if (action.equals("stat") && partial) return info(file, "", files);
        try (AutoCloseable lease = files.store.lease(key)) {
            String algorithm = FolioleCompanionResourceReadQueryRules.contentBlobCasString(context, "hashAlgorithm");
            if (action.equals("stat")) return info(file, algorithm, files);
            if (action.equals("hash")) return new JSObject().put("hash", AttachmentFileStore.digest(file, algorithm, files::check, () -> {}));
            files.store.acquire(); files.check();
            return mutate(files, call, action, key, algorithm);
        }
    }
    private static JSObject mutate(FolioleAttachmentBlockOwner files, PluginCall call, String action, String key, String algorithm) throws Exception {
        File file = files.store.resolve(key, true);
        if (action.equals("discard")) Files.deleteIfExists(file.toPath());
        else if (action.equals("publish")) {
            AttachmentFileStore.publish(file, files.store.resolve(key, false), key.substring(0, 64), algorithm, files::check, () -> {}, files.owner::publish);
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
    static boolean publish(Context context, File source, File target, String hash) throws Exception {
        File root = FolioleAttachmentMaintenanceFiles.directory(context, false);
        try (AutoCloseable lease = AttachmentFileLeases.acquire(root, hash)) {
            FolioleAttachmentBlockOwner acquired = null;
            synchronized (OWNERS) {
                for (FolioleAttachmentBlockOwner files : OWNERS.values()) {
                    if (files.store.root().equals(root.getCanonicalFile()) && files.store.acquired()) { acquired = files; break; }
                }
            }
            if (acquired != null) {
                try (AutoCloseable use = acquired.use()) { return publish(context, source, target, hash, acquired::check); }
            }
            try (AttachmentFileStore temporary = new AttachmentFileStore(root)) {
                temporary.acquire(); return publish(context, source, target, hash, () -> {});
            }
        }
    }
    private static boolean publish(Context context, File source, File target, String hash, Runnable check) throws Exception {
        String algorithm = FolioleCompanionResourceReadQueryRules.contentBlobCasString(context, "hashAlgorithm");
        return AttachmentFileStore.publish(source, target, hash, algorithm, check, () -> {});
    }
    static <T> T withRemoval(Context context, String key, java.util.concurrent.Callable<T> execute) throws Exception {
        try (AutoCloseable lease = AttachmentFileLeases.acquire(FolioleAttachmentMaintenanceFiles.directory(context, false), key)) {
            return execute.call();
        }
    }
    static File checkedSourceFile(File file) throws Exception { return AttachmentFileStore.checked(file); }
    static JSObject info(File file, String algorithm, FolioleAttachmentBlockOwner files) throws Exception {
        AttachmentFileStore.Info value = AttachmentFileStore.info(file);
        return new JSObject().put("present", value.present).put("length", value.length).put("hash",
            value.present && !algorithm.isEmpty() ? AttachmentFileStore.digest(file, algorithm, files::check, () -> {}) : "");
    }
    static long number(PluginCall call, String name) {
        Double value = call.getDouble(name);
        if (value == null || !Double.isFinite(value) || value < 0 || value > 8589934592L || value != Math.floor(value)) {
            throw new IllegalArgumentException("attachment_range_invalid");
        }
        return value.longValue();
    }
}
