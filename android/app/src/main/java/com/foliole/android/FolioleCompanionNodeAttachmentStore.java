package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionNodeAttachmentStore {

    private FolioleCompanionNodeAttachmentStore() {}

    static void backfillNodeAttachmentsFromVersions(Context context, SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery(
            "SELECT n.id, v.snapshot_json " +
                "FROM nodes n " +
                "INNER JOIN node_sync_versions v ON v.version_id = COALESCE(n.current_version_id, (" +
                    "SELECT latest.version_id FROM node_sync_versions latest " +
                    "WHERE latest.object_id = n.id ORDER BY latest.created_at DESC, latest.version_id DESC LIMIT 1" +
                "))",
            null
        )) {
            while (cursor.moveToNext()) {
                JSONObject snapshot = new JSONObject(cursor.getString(1));
                replaceNodeAttachments(context, database, cursor.getString(0), snapshot.optJSONArray("attachments"));
            }
        } catch (Exception ignored) {
            // Best-effort compatibility repair for pre-link-schema Android databases.
        }
    }

    static void replaceNodeAttachments(Context context, SQLiteDatabase database, String nodeId, JSONArray attachments) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, "nodeAttachmentDeleteByNode", new Object[] { nodeId });
        if (attachments == null) {
            return;
        }
        for (int index = 0; index < attachments.length(); index += 1) {
            JSONObject attachment = attachments.optJSONObject(index);
            if (attachment == null) {
                continue;
            }
            String attachmentId = attachment.optString("attachment_id", "").trim();
            String role = attachment.optString("role", "").trim();
            if (attachmentId.isEmpty() || role.isEmpty()) {
                continue;
            }
            FolioleCompanionNamedMutationStore.execute(context, database, "nodeAttachmentUpsert", new Object[] { nodeId, attachmentId, role });
        }
    }

    static JSONArray loadNodeAttachments(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(
            context,
            database,
            "nodeAttachments",
            new String[] { nodeId }
        ).getJSONArray("attachments");
    }
}
