package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionAttachmentFileStage {
    private FolioleCompanionAttachmentFileStage() {}

    static JSObject stage(Context context, String token) throws Exception {
        FolioleCompanionAttachmentResourceBatchSessions.Session session =
            FolioleCompanionAttachmentResourceBatchSessions.get(token);
        if (session == null) throw new IllegalStateException("Attachment resource batch token is unknown or expired.");
        if (session.stagedManifest != null) return response(context, session);
        JSArray manifest = new JSArray();
        Map<String, File> createdFiles = new HashMap<>();
        for (Map.Entry<String, File> entry : session.tempFilesById.entrySet()) {
            String id = entry.getKey();
            String hash = session.contentHashesById.get(id);
            if (hash == null) throw new IllegalStateException("Attachment batch content hash is missing.");
            File target = target(context, hash);
            boolean created = publish(entry.getValue(), target, hash, context);
            if (created) createdFiles.put(id, target);
            JSObject item = new JSObject();
            item.put("attachment_id", id);
            item.put("content_hash", hash);
            item.put("size_bytes", target.length());
            item.put("storage_key", hash);
            manifest.put(item);
        }
        FolioleCompanionAttachmentResourceBatchSessions.markStaged(token, manifest, createdFiles);
        return response(context, FolioleCompanionAttachmentResourceBatchSessions.get(token));
    }

    static void finish(String token, boolean committed) {
        FolioleCompanionAttachmentResourceBatchSessions.finish(token, committed);
    }

    private static boolean publish(File source, File target, String hash, Context context) throws Exception {
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        if (target.exists()) {
            if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, target))) {
                throw new IllegalStateException("Existing attachment resource hash mismatch.");
            }
            source.delete();
            return false;
        }
        if (!source.renameTo(target)) throw new IllegalStateException("Failed to stage attachment resource file.");
        return true;
    }

    private static File target(Context context, String hash) {
        return new File(new File(context.getFilesDir(), "attachments"), hash);
    }

    private static JSObject response(
        Context context,
        FolioleCompanionAttachmentResourceBatchSessions.Session session
    ) throws Exception {
        JSObject result = new JSObject();
        result.put(FolioleCompanionResourceReadQueryRules.attachmentBatchResponseKey(context, "manifest"), session.stagedManifest);
        result.put(
            FolioleCompanionResourceReadQueryRules.attachmentBatchResponseKey(context, "failedAttachmentIds"),
            new JSArray(session.failedIds)
        );
        return result;
    }
}
