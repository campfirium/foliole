package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionNodeAttachmentStore {

    private FolioleCompanionNodeAttachmentStore() {}

    static void backfillNodeAttachmentsFromVersions(Context context, SQLiteDatabase database) {
        try {
            JSONArray rows = FolioleCompanionNamedQueryStore.loadRows(
                context,
                database,
                backfillSnapshotRule(context, "queryName"),
                backfillSnapshotRule(context, "resultKey")
            );
            for (int index = 0; index < rows.length(); index += 1) {
                JSONObject row = rows.getJSONObject(index);
                JSONObject snapshot = new JSONObject(row.getString(backfillSnapshotRule(context, "snapshotJsonKey")));
                replaceNodeAttachments(context, database, row.getString(backfillSnapshotRule(context, "idKey")), snapshot.optJSONArray("attachments"));
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
            nodeAttachmentRule(context, "queryName"),
            new String[] { nodeId }
        ).getJSONArray(nodeAttachmentRule(context, "resultKey"));
    }

    private static String backfillSnapshotRule(Context context, String key) throws Exception {
        return FolioleCompanionNodeAttachmentQueryRules.backfillSnapshotString(context, key);
    }

    private static String nodeAttachmentRule(Context context, String key) throws Exception {
        return FolioleCompanionNodeAttachmentQueryRules.nodeAttachmentString(context, key);
    }
}
