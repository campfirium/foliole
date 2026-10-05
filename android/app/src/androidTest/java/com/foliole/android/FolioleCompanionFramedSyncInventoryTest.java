package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.InventoryEntry;
import java.io.File;
import java.util.List;
import org.junit.Test;

public final class FolioleCompanionFramedSyncInventoryTest {
    @Test public void readsCanonicalNodeRelationReviewAndBodyInventory() throws Exception {
        File file = File.createTempFile("framed-inventory-", ".db");
        SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null);
        database.execSQL("CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT)");
        database.execSQL("CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, " +
            "object_id TEXT, body_text TEXT, content_hash TEXT)");
        database.execSQL("CREATE TABLE node_sync_version_parents (version_id TEXT, " +
            "parent_version_id TEXT, ordinal INTEGER)");
        database.execSQL("CREATE TABLE review_log (node_id TEXT, op_id TEXT)");
        database.execSQL("INSERT INTO nodes VALUES ('node-1', 'version-1')");
        database.execSQL("INSERT INTO node_sync_versions VALUES " +
            "('version-1', 'node-1', 'body', ?) ", new Object[] { repeat("11", 32) });
        database.execSQL("INSERT INTO node_sync_version_parents VALUES " +
            "('version-1', 'version-0', 2)");
        database.execSQL("INSERT INTO review_log VALUES ('node-1', 'review-1')");
        database.close();
        try {
            List<InventoryEntry> entries = FolioleCompanionFramedSyncInventory.read(file.getPath());
            assertEquals(1, entries.size());
            assertEquals("version-1", entries.get(0).getFrontierFactIds(0));
            assertEquals("[\"version-1\",\"version-0\",2]",
                entries.get(0).getRequiredRelationIds(0));
            assertEquals("review-1", entries.get(0).getReviewFactIds(0));
        } finally {
            if (!file.delete()) file.deleteOnExit();
        }
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < count; index++) result.append(value);
        return result.toString();
    }
}
