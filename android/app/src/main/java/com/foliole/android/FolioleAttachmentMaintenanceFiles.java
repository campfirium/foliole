package com.foliole.android;

import android.content.Context;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructStat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

final class FolioleAttachmentMaintenanceFiles {
    static JSObject execute(Context context, PluginCall call) throws Exception {
        String operation = call.getString("operation", "");
        File state = new File(context.getFilesDir(), "attachment-observations.json");
        if (operation.equals("read-state")) return new JSObject().put("state", state.exists()
            ? readState(state) : org.json.JSONObject.NULL);
        if (operation.equals("write-state")) {
            File temporary = new File(context.getFilesDir(), "attachment-observations.partial");
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(call.getString("state", "").getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
            }
            Os.rename(temporary.getPath(), state.getPath());
            return new JSObject();
        }
        if (operation.equals("generation")) return generation(context, call.getString("databasePath", ""));
        boolean trash = call.getBoolean("trash", false);
        File root = directory(context, trash);
        if (operation.equals("inventory")) return new JSObject().put("files", inventory(root));
        String key = call.getString("storageKey", "");
        if (!FolioleCompanionCanonicalAttachmentKey.valid(key)) throw new IllegalArgumentException("invalid_attachment_key");
        if (operation.equals("move")) move(context, key, trash);
        else if (operation.equals("remove-trash")) {
            File file = new File(directory(context, true), key);
            requireFile(file);
            if (!file.delete()) throw new IllegalStateException("attachment_remove_failed");
        } else throw new IllegalArgumentException("invalid_attachment_operation");
        return new JSObject();
    }

    static File directory(Context context, boolean trash) {
        return new File(context.getFilesDir(), trash ? "attachments.trash" : "attachments");
    }

    static void move(Context context, String key, boolean toTrash) throws Exception {
        if (!FolioleCompanionCanonicalAttachmentKey.valid(key)) throw new IllegalArgumentException("invalid_attachment_key");
        File source = new File(directory(context, !toTrash), key);
        File destination = new File(directory(context, toTrash), key);
        if (!source.exists()) return;
        requireFile(source);
        if (!destination.getParentFile().isDirectory() && !destination.getParentFile().mkdirs()) {
            throw new IllegalStateException("attachment_directory_failed");
        }
        if (destination.exists()) {
            requireFile(destination);
            String hash = key.substring(0, 64);
            if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, source))
                || !hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, destination))) {
                throw new IllegalStateException("attachment_destination_conflict");
            }
            if (!source.delete()) throw new IllegalStateException("attachment_remove_failed");
        } else {
            Os.link(source.getPath(), destination.getPath());
            if (!source.delete()) throw new IllegalStateException("attachment_move_failed");
        }
    }

    private static JSArray inventory(File root) throws Exception {
        JSArray result = new JSArray();
        if (!root.exists()) return result;
        File[] files = root.listFiles();
        if (files == null) throw new IllegalStateException("attachment_inventory_failed");
        for (File file : files) {
            if (!FolioleCompanionCanonicalAttachmentKey.valid(file.getName())) continue;
            requireFile(file);
            result.put(new JSObject().put("storageKey", file.getName()).put("sizeBytes", file.length()));
        }
        return result;
    }

    private static JSObject generation(Context context, String databasePath) throws Exception {
        File file = new File(databasePath).getCanonicalFile();
        if (!file.getPath().startsWith(context.getDataDir().getCanonicalPath() + File.separator)) {
            throw new IllegalArgumentException("database_path_outside_app");
        }
        StructStat stat = Os.stat(file.getPath());
        return new JSObject().put("generation", stat.st_dev + ":" + stat.st_ino);
    }

    private static void requireFile(File file) {
        try {
            if (OsConstants.S_ISREG(Os.lstat(file.getPath()).st_mode)) return;
        } catch (Exception ignored) {
            throw new IllegalStateException("attachment_file_unsafe");
        }
        throw new IllegalStateException("attachment_file_unsafe");
    }

    private static String readState(File state) throws Exception {
        try (FileInputStream input = new FileInputStream(state);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
