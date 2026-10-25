package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.AttachmentFileStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.nio.charset.StandardCharsets;

final class FolioleAttachmentBlockSources {
    private FolioleAttachmentBlockSources() {}
    static JSObject batch(Context context, FolioleAttachmentBlockOwner files, PluginCall call) throws Exception {
        JSArray keys = call.getArray("keys");
        if (keys == null || keys.length() > 64) throw new IllegalArgumentException("attachment_stat_batch_invalid");
        int bytes = 0;
        for (int i = 0; i < keys.length(); i++) {
            if (!(keys.get(i) instanceof String)) throw new IllegalArgumentException("attachment_stat_batch_invalid");
            bytes += keys.getString(i).getBytes(StandardCharsets.UTF_8).length;
            if (bytes > 16384) throw new IllegalArgumentException("attachment_stat_batch_invalid");
            files.store.resolve(keys.getString(i), false);
        }
        JSArray presence = new JSArray();
        for (int i = 0; i < keys.length(); i++) presence.put(access(context, files, call, "source-stat", keys.getString(i)).getBoolean("present"));
        return new JSObject().put("presence", presence);
    }
    static JSObject access(Context context, FolioleAttachmentBlockOwner files, PluginCall call, String action, String key) throws Exception {
        if (action.equals("source-open") || action.equals("source-stat")) return open(context, files, action, key);
        FolioleAttachmentBlockOwner.Source source;
        synchronized (files) {
            source = action.equals("source-close") ? files.sources.remove(key) : files.sources.get(key);
        }
        if (action.equals("source-close")) { if (source != null) synchronized (source) { source.close(); } return new JSObject(); }
        if (!action.equals("source-read") || source == null) throw new IllegalStateException("attachment_send_missing");
        long offset = FolioleAttachmentBlockFiles.number(call, "offset"), length = FolioleAttachmentBlockFiles.number(call, "length");
        synchronized (source) {
            if (length > 524288 || offset + length > source.file.length()) throw new IllegalArgumentException("attachment_source_range_invalid");
            byte[] bytes = new byte[(int) length]; source.file.seek(offset); source.file.readFully(bytes);
            return new JSObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
        }
    }
    private static JSObject open(Context context, FolioleAttachmentBlockOwner files, String action, String key) throws Exception {
        File file = files.store.resolve(key, false);
        if (!file.exists()) file = new File(FolioleAttachmentMaintenanceFiles.directory(context, true), key);
        if (action.equals("source-stat")) return FolioleAttachmentBlockFiles.info(file, "", files);
        AutoCloseable lease = files.store.lease(key);
        try {
            AttachmentFileStore.Info value = AttachmentFileStore.info(file);
            if (value.present) {
                var source = new FolioleAttachmentBlockOwner.Source(file, lease);
                try { synchronized (files) { files.check(); files.sources.put(key, source); } }
                catch (Exception error) { source.close(); throw error; }
                lease = null;
            }
            return new JSObject().put("present", value.present).put("length", value.length).put("hash", "");
        } finally { if (lease != null) lease.close(); }
    }
}
