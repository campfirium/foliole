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
            String mimeType = session.mimeTypesById.get(id);
            String storageKey = session.storageKeysById.get(id);
            if (hash == null || mimeType == null || storageKey == null ||
                !FolioleCompanionCanonicalAttachmentKey.matches(hash, mimeType, storageKey)) {
                throw new IllegalStateException("Attachment batch resource description is invalid.");
            }
            File target = target(context, storageKey);
            boolean created = FolioleAttachmentBlockFiles.publish(context, entry.getValue(), target, hash);
            if (created) createdFiles.put(id, target);
            JSObject item = new JSObject();
            item.put("attachment_id", id);
            item.put("content_hash", hash);
            item.put("size_bytes", target.length());
            item.put("mime_type", mimeType);
            item.put("storage_key", storageKey);
            manifest.put(item);
        }
        FolioleCompanionAttachmentResourceBatchSessions.markStaged(token, manifest, createdFiles);
        return response(context, FolioleCompanionAttachmentResourceBatchSessions.get(token));
    }

    static void finish(String token, boolean committed) throws Exception {
        FolioleCompanionAttachmentResourceBatchSessions.finish(token, committed);
    }

    // The caller holds the library receiver lock across the existence check and atomic move.
    static boolean publishVerified(File source, File target, String hash) throws Exception {
        if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(source))) {
            throw new IllegalStateException("Attachment resource hash mismatch.");
        }
        if (target.exists()) {
            if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(target))) {
                throw new IllegalStateException("Existing attachment resource hash mismatch.");
            }
            java.nio.file.Files.delete(source.toPath());
            return false;
        }
        java.nio.file.Files.move(source.toPath(), target.toPath(), java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        return true;
    }

    private static File target(Context context, String storageKey) {
        return new File(new File(context.getFilesDir(), "attachments"), storageKey);
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
