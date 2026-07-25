package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;

import org.json.JSONObject;

final class FolioleCompanionNodeRekey {
    private static final String[] TWO_ID_MUTATIONS = new String[] {
        "nodeRekeyChildren",
        "nodeRekeyReview",
        "nodeRekeyReading",
        "nodeRekeyOpenState",
        "nodeRekeyReadingDeviceState",
        "nodeRekeyReviewLog",
        "nodeRekeyTombstones",
        "nodeRekeyConflicts",
        "nodeRekeyAlternatives",
        "nodeRekeyOrder",
        "nodeRekeyViewState",
        "nodeRekeyAttachments",
        "nodeRekeySyncState",
        "nodeRekeyPushAck"
    };
    private static final String[] COPY_FIELDS = new String[] {
        "parent_id", "kind", "priority", "desired_retention", "enable_short_term", "sequential_reading_enabled",
        "shelved_at", "manual_child_order", "title", "is_title_manual", "hide_title_heading", "content",
        "body_blob_hash", "opening_text", "virtual_filter", "reveal", "anchor_link", "anchor_resolution_status",
        "anchor_source_version_id", "image_regions", "import_source_fingerprint", "import_content_fingerprint",
        "position", "current_version_id", "last_modified_by_device_id", "sync_dirty", "created_at", "updated_at",
        "deleted_at"
    };

    private FolioleCompanionNodeRekey() {}

    static void rekey(Context context, SQLiteDatabase database, String sourceId, String canonicalId) throws Exception {
        JSONObject source = loadNode(context, database, sourceId);
        if (source != null) execute(context, database, "nodeRekeyCopy", copyArgs(canonicalId, source));
        if (!nodeExists(context, database, canonicalId)) {
            throw new IllegalStateException("sync_rekey_source_missing");
        }
        for (String mutation : TWO_ID_MUTATIONS) {
            execute(context, database, mutation, new Object[] { canonicalId, sourceId });
        }
        rekeyVersions(context, database, sourceId, canonicalId);
        execute(context, database, "nodeRekeyDeleteSource", new Object[] { sourceId });
    }

    private static void rekeyVersions(
        Context context,
        SQLiteDatabase database,
        String sourceId,
        String canonicalId
    ) throws Exception {
        JSArray rows = FolioleCompanionGeneratedQueryRunner.loadRows(
            context, database, "nodeVersionsForRekey", "rows", new String[] { sourceId }
        );
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            execute(context, database, "nodeRekeyVersion", new Object[] {
                canonicalId,
                rekeySnapshot(row.optString("snapshot_json", null), canonicalId),
                row.getString("version_id")
            });
        }
    }

    private static String rekeySnapshot(String value, String canonicalId) {
        if (value == null) return null;
        try {
            return new JSONObject(value).put("id", canonicalId).toString();
        } catch (Exception ignored) {
            return value;
        }
    }

    private static JSONObject loadNode(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        return FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context, database, "nodeByIdForRekey", "rows", new String[] { nodeId }
        );
    }

    private static Object[] copyArgs(String canonicalId, JSONObject source) throws Exception {
        Object[] args = new Object[COPY_FIELDS.length + 1];
        args[0] = canonicalId;
        for (int index = 0; index < COPY_FIELDS.length; index += 1) {
            String key = COPY_FIELDS[index];
            args[index + 1] = source.isNull(key) ? null : source.get(key);
        }
        return args;
    }

    private static boolean nodeExists(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        return FolioleCompanionGeneratedQueryRunner.hasRows(
            context, database, "nodeExistsById", "rows", new String[] { nodeId }
        );
    }

    private static void execute(
        Context context,
        SQLiteDatabase database,
        String name,
        Object[] args
    ) throws Exception {
        FolioleCompanionGeneratedMutationRunner.execute(context, database, name, args);
    }
}
