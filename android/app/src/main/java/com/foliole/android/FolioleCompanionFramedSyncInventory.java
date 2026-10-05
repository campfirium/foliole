package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.android.framed.FramedSyncContract;
import com.foliole.sync.v22.InventoryEntry;
import com.google.protobuf.ByteString;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;

final class FolioleCompanionFramedSyncInventory {
    private FolioleCompanionFramedSyncInventory() {}

    static List<InventoryEntry> read(String snapshotPath) throws Exception {
        SQLiteDatabase database = SQLiteDatabase.openDatabase(
            snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        try {
            Map<String, List<String>> parents = parentFacts(database);
            Map<String, List<String>> reviews = reviewFacts(database);
            List<InventoryEntry> result = new ArrayList<>();
            try (Cursor rows = database.rawQuery(
                "SELECT node.id, node.current_version_id, version.body_text, version.content_hash " +
                "FROM nodes node JOIN node_sync_versions version " +
                "ON version.version_id = node.current_version_id ORDER BY node.id LIMIT ?",
                new String[] { String.valueOf(FramedSyncContract.MAX_FACTS_PER_TRANSFER + 1) })) {
                while (rows.moveToNext()) {
                    if (result.size() >= FramedSyncContract.MAX_FACTS_PER_TRANSFER) {
                        throw new IllegalArgumentException("inventory_entry_limit_exceeded");
                    }
                    String nodeId = rows.getString(0);
                    String body = rows.isNull(2) ? "" : rows.getString(2);
                    result.add(InventoryEntry.newBuilder()
                        .setObjectType("node").setGlobalId(nodeId)
                        .setSharedStateHash(ByteString.copyFrom(hexDigest(rows.getString(3))))
                        .addFrontierFactIds(rows.getString(1))
                        .addAllRequiredRelationIds(values(parents, nodeId))
                        .addAllReviewFactIds(values(reviews, nodeId))
                        .addResourceHashes(ByteString.copyFrom(MessageDigest.getInstance("SHA-256")
                            .digest(body.getBytes(StandardCharsets.UTF_8))))
                        .build());
                }
            }
            return result;
        } finally {
            database.close();
        }
    }

    private static Map<String, List<String>> parentFacts(SQLiteDatabase database) throws Exception {
        Map<String, List<String>> result = new HashMap<>();
        try (Cursor rows = database.rawQuery(
            "SELECT version.object_id, parent.version_id, parent.parent_version_id, parent.ordinal " +
            "FROM node_sync_version_parents parent JOIN node_sync_versions version " +
            "ON version.version_id = parent.version_id ORDER BY version.object_id, " +
            "parent.version_id, parent.ordinal, parent.parent_version_id", null)) {
            while (rows.moveToNext()) {
                String factId = new JSONArray().put(rows.getString(1)).put(rows.getString(2))
                    .put(rows.getLong(3)).toString();
                result.computeIfAbsent(rows.getString(0), ignored -> new ArrayList<>()).add(factId);
            }
        }
        return result;
    }

    private static Map<String, List<String>> reviewFacts(SQLiteDatabase database) {
        Map<String, List<String>> result = new HashMap<>();
        try (Cursor rows = database.rawQuery(
            "SELECT node_id, op_id FROM review_log ORDER BY node_id, op_id", null)) {
            while (rows.moveToNext()) {
                result.computeIfAbsent(rows.getString(0), ignored -> new ArrayList<>())
                    .add(rows.getString(1));
            }
        }
        return result;
    }

    private static List<String> values(Map<String, List<String>> values, String key) {
        List<String> result = values.get(key);
        return result == null ? java.util.Collections.emptyList() : result;
    }

    private static byte[] hexDigest(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("framed_sync_inventory_state_hash_invalid");
        }
        byte[] result = new byte[32];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }
}
