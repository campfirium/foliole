package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;

import org.json.JSONObject;

final class FolioleCompanionSyncPackApplyExtras {
    private FolioleCompanionSyncPackApplyExtras() {}

    static JSArray applyReviewLog(SQLiteDatabase database) throws Exception {
        JSArray reviews = new JSArray();
        if (!incomingTableExists(database, "review_log")) {
            return reviews;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, " +
                "due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after " +
                "FROM inc.review_log ORDER BY reviewed_at ASC, op_id ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                JSONObject review = new JSONObject();
                review.put("id", cursor.getString(0));
                review.put("op_id", cursor.getString(1));
                review.put("device_id", cursor.getString(2));
                review.put("node_id", cursor.getString(3));
                review.put("grade", cursor.getInt(4));
                review.put("scheduler_version", cursor.getString(5));
                review.put("reviewed_at", cursor.getString(6));
                review.put("due_before", cursor.getString(7));
                review.put("stability_before", cursor.getDouble(8));
                review.put("difficulty_before", cursor.getDouble(9));
                review.put("due_after", cursor.getString(10));
                review.put("stability_after", cursor.getDouble(11));
                review.put("difficulty_after", cursor.getDouble(12));
                reviews.put(review);
            }
        }
        return FolioleCompanionSyncReviewLogApplyHarness.applyAndConfirmReviewLogRows(database, reviews);
    }

    static void replaceNodeOrder(SQLiteDatabase database) {
        if (!incomingTableExists(database, "node_order")) {
            return;
        }
        database.execSQL(
            "DELETE FROM main.node_order WHERE node_id IN (" +
                "SELECT object_id FROM " + FolioleCompanionSyncPackApplyableRows.sql("node") + ") " +
                "AND node_id NOT IN (SELECT node_id FROM inc.node_order)"
        );
        database.execSQL(
            "INSERT OR REPLACE INTO main.node_order (node_id, position) " +
                "SELECT node_id, position FROM inc.node_order " +
                "WHERE node_id IN (SELECT object_id FROM " + FolioleCompanionSyncPackApplyableRows.sql("node") + ")"
        );
    }

    private static boolean incomingTableExists(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM inc.sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }
}
