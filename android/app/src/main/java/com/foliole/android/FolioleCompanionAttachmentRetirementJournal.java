package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

final class FolioleCompanionAttachmentRetirementJournal {
    private FolioleCompanionAttachmentRetirementJournal() {}

    static JSObject prepare(Context context, PluginCall call) throws Exception {
        JSArray tombstones = call.getArray("tombstones");
        if (tombstones == null || tombstones.length() == 0) throw new IllegalArgumentException("tombstones is required");
        String libraryScope = required(call.getData(), "library_scope");
        File root = root(context), stageRoot = new File(root, UUID.randomUUID().toString());
        if (!stageRoot.mkdirs() && !stageRoot.isDirectory()) throw new IllegalStateException("Retirement stage unavailable.");
        JSONArray items = new JSONArray();
        for (int index = 0; index < tombstones.length(); index++) {
            JSONObject value = tombstones.getJSONObject(index);
            String attachmentId = required(value, "attachment_id");
            String contentHash = required(value, "content_hash");
            String storageKey = safeName(required(value, "storage_key"));
            String mimeType = required(value, "mime_type");
            if (!contentHash.matches("^[a-f0-9]{64}$")) throw new IllegalArgumentException("Invalid attachment hash.");
            File source = new File(new File(context.getFilesDir(), "attachments"), storageKey);
            if (source.isFile() && !contentHash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, source))) {
                throw new IllegalStateException("Attachment retirement source hash mismatch.");
            }
            items.put(new JSONObject().put("attachment_id", attachmentId).put("content_hash", contentHash)
                .put("storage_key", storageKey).put("mime_type", mimeType).put("source", source.getAbsolutePath())
                .put("staged", new File(stageRoot, storageKey).getAbsolutePath()).put("source_present", source.isFile()));
        }
        File journal = new File(root, stageRoot.getName() + ".json");
        JSONObject value = new JSONObject().put("version", 1).put("library_scope", libraryScope)
            .put("stage", "planned").put("stage_history", new JSONArray().put("planned")).put("items", items);
        write(journal, value);
        advance(journal, value, "targets_prepared");
        return new JSObject().put("journal_token", stageRoot.getName());
    }

    static JSObject finish(Context context, PluginCall call) throws Exception {
        String token = safeName(call.getString("journal_token", ""));
        File journal = new File(root(context), token + ".json");
        JSONObject value = new JSONObject(new String(Files.readAllBytes(journal.toPath()), StandardCharsets.UTF_8));
        if (!call.getBoolean("committed", false)) {
            restore(value);
            advance(journal, value, "restored");
            return new JSObject();
        }
        advance(journal, value, "database_committed");
        JSONArray items = value.getJSONArray("items");
        for (int index = 0; index < items.length(); index++) stage(context, items.getJSONObject(index));
        for (int index = 0; index < items.length(); index++) verify(context, items.getJSONObject(index));
        advance(journal, value, "verified");
        return new JSObject();
    }

    static JSObject finalizeJournal(Context context, PluginCall call) throws Exception {
        String token = safeName(call.getString("journal_token", ""));
        File journal = new File(root(context), token + ".json");
        JSONObject value = new JSONObject(new String(Files.readAllBytes(journal.toPath()), StandardCharsets.UTF_8));
        String stage = value.optString("stage");
        if (!stage.equals("verified") && !stage.equals("finalized")) {
            throw new IllegalStateException("Attachment retirement journal is not verified.");
        }
        JSONArray items = value.getJSONArray("items");
        for (int index = 0; index < items.length(); index++) {
            Files.deleteIfExists(new File(items.getJSONObject(index).getString("staged")).toPath());
        }
        advance(journal, value, "finalized");
        return new JSObject();
    }

    private static void stage(Context context, JSONObject item) throws Exception {
        if (!item.getBoolean("source_present")) return;
        File source = new File(item.getString("source")), staged = new File(item.getString("staged"));
        if (staged.isFile()) {
            if (!item.getString("content_hash").equals(FolioleCompanionAttachmentResourceHash.digestHex(context, staged))) {
                throw new IllegalStateException("Attachment retirement staged hash mismatch.");
            }
            return;
        }
        if (!source.isFile() || !item.getString("content_hash").equals(
            FolioleCompanionAttachmentResourceHash.digestHex(context, source))) {
            throw new IllegalStateException("Attachment retirement identity changed.");
        }
        Files.move(source.toPath(), staged.toPath(), StandardCopyOption.ATOMIC_MOVE);
    }

    private static void verify(Context context, JSONObject item) throws Exception {
        if (!item.getBoolean("source_present")) return;
        File source = new File(item.getString("source")), staged = new File(item.getString("staged"));
        if (source.exists() || !staged.isFile() || !item.getString("content_hash").equals(
            FolioleCompanionAttachmentResourceHash.digestHex(context, staged))) {
            throw new IllegalStateException("Attachment retirement staging verification failed.");
        }
    }

    private static void restore(JSONObject value) throws Exception {
        JSONArray items = value.getJSONArray("items");
        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.getJSONObject(index);
            File source = new File(item.getString("source")), staged = new File(item.getString("staged"));
            if (staged.isFile() && !source.exists()) Files.move(staged.toPath(), source.toPath(), StandardCopyOption.ATOMIC_MOVE);
        }
    }

    private static File root(Context context) {
        File root = new File(context.getFilesDir(), "attachment-retirement");
        if (!root.mkdirs() && !root.isDirectory()) throw new IllegalStateException("Retirement journal unavailable.");
        return root;
    }

    private static String safeName(String value) {
        if (value.isEmpty() || value.contains("/") || value.contains("\\") || value.equals(".") || value.equals("..")) {
            throw new IllegalArgumentException("Invalid retirement path component.");
        }
        return value;
    }

    private static String required(JSONObject value, String key) throws Exception {
        String result = value.optString(key, "").trim();
        if (result.isEmpty()) throw new IllegalArgumentException("Missing " + key);
        return result;
    }

    private static void write(File target, JSONObject value) throws Exception {
        File temporary = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write((value.toString(2) + "\n").getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private static void advance(File journal, JSONObject value, String stage) throws Exception {
        JSONArray history = value.optJSONArray("stage_history");
        if (history == null) history = new JSONArray();
        if (history.length() == 0 || !stage.equals(history.optString(history.length() - 1))) history.put(stage);
        write(journal, value.put("stage", stage).put("stage_history", history));
    }
}
