package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.database.sqlite.SQLiteDatabase;

import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.File;

public final class FolioleCompanionSyncPackDependencySourceTest {
    @Test public void pagedClaimsSkipHeldReviewsAcrossPageBoundaries() throws Exception {
        File snapshot = File.createTempFile("paged-review-dependencies-", ".db",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        FolioleCompanionSyncPackFactClaims claims = FolioleCompanionSyncPackFactClaims.create(
            InstrumentationRegistry.getInstrumentation().getTargetContext(), "paged-review-peer");
        try {
            seed(snapshot);
            JSONArray reviews = index().getJSONArray("reviews");
            for (int start = 0; start < reviews.length(); start += 128) {
                JSONArray page = new JSONArray();
                for (int i = start; i < Math.min(start + 128, reviews.length()); i++) {
                    page.put(reviews.getJSONObject(i));
                }
                JSONObject pageIndex = new JSONObject().put("versions", new JSONArray())
                    .put("parents", new JSONArray()).put("reviews", page);
                claims.accept(pageIndex, "", "", start == 256 ? "07" : "ff".repeat(16));
            }
            FolioleCompanionSyncPackFactPages.Session fact = new FolioleCompanionSyncPackFactPages.Session(
                InstrumentationRegistry.getInstrumentation().getTargetContext(), snapshot.getPath(),
                "paged-review-peer", "view", 0, 1, 1, "epoch", claims);
            FolioleCompanionSyncPackDependencySource.Session missing =
                FolioleCompanionSyncPackDependencySource.startPaged(snapshot.getPath(),
                    "paged-review-peer", "group", "source", fact);
            assertEquals(1, missing.expectedRows);
            assertEquals("op-0259", missing.page(0, missing.initialDigest())
                .getJSONArray("rows").getJSONObject(0).getJSONObject("key").getString("key"));
            claims.accept(new JSONObject().put("versions", new JSONArray())
                .put("parents", new JSONArray()).put("reviews",
                    new JSONArray().put(reviews.getJSONObject(259))), "", "", "01");
            assertEquals(0, FolioleCompanionSyncPackDependencySource.startPaged(snapshot.getPath(),
                "paged-review-peer", "group", "source", fact).expectedRows);
        } finally {
            claims.close();
            if (!snapshot.delete()) snapshot.deleteOnExit();
        }
    }

    @Test public void pagesMissingReviewEventsFromOneAndroidSnapshot() throws Exception {
        File snapshot = File.createTempFile("review-dependencies-", ".db",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        try {
            seed(snapshot);
            JSONObject index = index();
            FolioleCompanionSyncPackDependencySource.Session all =
                FolioleCompanionSyncPackDependencySource.start(snapshot.getPath(), "peer", "group",
                    "source", 0, 1, 1, "epoch", index, "", "", "00".repeat(33));
            assertEquals("node_review", all.transfer.getString("objectType"));
            assertEquals(260, all.expectedRows);
            int after = 0;
            String digest = all.initialDigest();
            while (after < all.expectedRows) {
                JSONObject page = all.page(after, digest);
                assertEquals(after, page.getInt("afterRow"));
                assertEquals("review_log", page.getJSONArray("rows")
                    .getJSONObject(0).getString("table"));
                after += page.getJSONArray("rows").length();
                digest = page.getString("afterDigest");
            }
            all.assertFinal(after, digest);
            assertNull(all.page(after, digest));

            FolioleCompanionSyncPackDependencySource.Session missing =
                FolioleCompanionSyncPackDependencySource.start(snapshot.getPath(), "peer", "group",
                    "source", 0, 1, 1, "epoch", index, "", "", "ff".repeat(32) + "07");
            assertEquals(1, missing.expectedRows);
            JSONObject row = missing.page(0, missing.initialDigest()).getJSONArray("rows").getJSONObject(0);
            assertEquals("op-0259", row.getJSONObject("key").getString("key"));
            assertEquals("op-0259", new JSONObject(row.getString("json")).getString("op_id"));
        } finally {
            if (!snapshot.delete()) snapshot.deleteOnExit();
        }
    }

    private static JSONObject index() throws Exception {
        JSONArray reviews = new JSONArray();
        for (int i = 0; i < 260; i++) reviews.put(new JSONObject().put("op_id", op(i)));
        return new JSONObject().put("from_state_seq", 0).put("to_state_seq", 1)
            .put("frontier_state_seq", 1).put("source_epoch", "epoch")
            .put("versions", new JSONArray()).put("parents", new JSONArray())
            .put("reviews", reviews);
    }

    private static void seed(File snapshot) {
        SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(snapshot, null);
        try {
            db.execSQL("CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER)");
            db.execSQL("CREATE TABLE node_text_alternatives (alternative_id TEXT, node_id TEXT)");
            db.execSQL("CREATE TABLE nodes (id TEXT, parent_id TEXT)");
            db.execSQL("CREATE TABLE node_sync_versions (version_id TEXT, object_id TEXT, " +
                "parent_version_id TEXT, host_name TEXT, created_at TEXT, content_hash TEXT, " +
                "body_text TEXT, snapshot_json TEXT)");
            db.execSQL("CREATE TABLE node_sync_version_parents " +
                "(version_id TEXT, parent_version_id TEXT, ordinal INTEGER)");
            db.execSQL("CREATE TABLE review_log (op_id TEXT, id TEXT, host_name TEXT, node_id TEXT, " +
                "grade INTEGER, scheduler_version TEXT, reviewed_at TEXT, due_before TEXT, " +
                "stability_before REAL, difficulty_before REAL, due_after TEXT, " +
                "stability_after REAL, difficulty_after REAL)");
            db.execSQL("INSERT INTO sync_object_state VALUES ('node_review','node',1)");
            db.execSQL("INSERT INTO nodes VALUES ('node',NULL)");
            db.beginTransaction();
            try {
                for (int i = 0; i < 260; i++) db.execSQL(
                    "INSERT INTO review_log VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    new Object[] { op(i), "review-" + i, "source", "node", 3, "ts-fsrs@4",
                        "now", "before", 1.0, 2.0, "after", 3.0, 4.0 });
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
        } finally { db.close(); }
    }

    private static String op(int index) {
        return String.format(java.util.Locale.ROOT, "op-%04d", index);
    }
}
