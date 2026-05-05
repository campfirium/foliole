package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncPackApplyTest {
    private Context context;
    private SQLiteDatabase mainDatabase;
    private File packFile;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        mainDatabase = SQLiteDatabase.create(null);
        packFile = new File(context.getCacheDir(), "sync-pack-apply.db");
        deletePackFile();
        createMainSchema();
    }

    @After
    public void tearDown() {
        if (mainDatabase != null && mainDatabase.isOpen()) {
            mainDatabase.close();
        }
        deletePackFile();
    }

    @Test
    public void appliesStructureRowsAndBlobManifestFromIncomingPack() throws Exception {
        createIncomingPack();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(1, result.getInt("applied_blob_count"));
        assertEquals("", selectString("SELECT content FROM nodes WHERE id = 'node-1'"));
        assertEquals("blob-1", selectString("SELECT body_blob_hash FROM nodes WHERE id = 'node-1'"));
        assertEquals("missing", selectString("SELECT availability FROM content_blobs WHERE hash = 'blob-1'"));
        assertEquals("android-test", selectString(
            "SELECT last_modified_by_device_id FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'"
        ));
        assertNotNull(selectString(
            "SELECT state_seq FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'"
        ));
    }

    @Test
    public void skipsRowsOlderThanLocalSyncState() throws Exception {
        createIncomingPack();
        mainDatabase.execSQL("INSERT INTO nodes (" +
            "id, kind, title, content, created_at, updated_at) VALUES (" +
            "'node-1', 'topic', 'Local Node', 'local body', " +
            "'2026-04-27T00:00:00.000Z', '2026-04-28T00:00:00.000Z')");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty) " +
            "VALUES ('node', 'node-1', 1, 'local-hash', 'android-local', '2026-04-28T00:00:00.000Z', 1)");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(0, result.getInt("applied_object_count"));
        assertEquals("local body", selectString("SELECT content FROM nodes WHERE id = 'node-1'"));
        assertEquals("local-hash", selectString(
            "SELECT content_hash FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'"
        ));
    }

    private void createMainSchema() {
        mainDatabase.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', title TEXT NOT NULL, " +
            "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
            "content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, created_at TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT)");
        mainDatabase.execSQL("CREATE TABLE external_documents (" +
            "document_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, relative_path TEXT NOT NULL, " +
            "file_name TEXT NOT NULL, extension TEXT NOT NULL, source_size_bytes INTEGER NOT NULL, " +
            "source_modified_at TEXT NOT NULL, source_modified_ms INTEGER NOT NULL, content_hash TEXT NOT NULL, " +
            "title TEXT, opening_text TEXT, body_blob_hash TEXT, content TEXT NOT NULL DEFAULT '', " +
            "indexed_at TEXT NOT NULL, is_present INTEGER NOT NULL DEFAULT 1, missing_at TEXT, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
            "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
        mainDatabase.execSQL("CREATE TABLE sync_object_state (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, " +
            "current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "PRIMARY KEY (object_type, object_id), UNIQUE (state_seq))");
    }

    private void createIncomingPack() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openOrCreateDatabase(packFile, null);
        try {
            packDatabase.execSQL("CREATE TABLE pack_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
            packDatabase.execSQL("CREATE TABLE nodes (" +
                "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, " +
                "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
                "body_blob_hash TEXT, content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, " +
                "updated_at TEXT NOT NULL, deleted_at TEXT)");
            packDatabase.execSQL("CREATE TABLE external_documents (" +
                "document_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, relative_path TEXT NOT NULL, " +
                "file_name TEXT NOT NULL, extension TEXT NOT NULL, source_size_bytes INTEGER NOT NULL, " +
                "source_modified_at TEXT NOT NULL, source_modified_ms INTEGER NOT NULL, content_hash TEXT NOT NULL, " +
                "title TEXT, opening_text TEXT, body_blob_hash TEXT, content TEXT NOT NULL DEFAULT '', " +
                "indexed_at TEXT NOT NULL, is_present INTEGER NOT NULL DEFAULT 1, missing_at TEXT, " +
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
            packDatabase.execSQL("CREATE TABLE content_blobs (" +
                "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
                "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
                "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
                "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
                "cached_at TEXT, last_verified_at TEXT)");
            packDatabase.execSQL("CREATE TABLE sync_object_state (" +
                "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, " +
                "content_hash TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, " +
                "PRIMARY KEY (object_type, object_id))");
            insertIncomingRows(packDatabase);
        } finally {
            packDatabase.close();
        }
    }

    private void insertIncomingRows(SQLiteDatabase packDatabase) {
        String now = "2026-04-27T00:00:00.000Z";
        packDatabase.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', '{}')");
        packDatabase.execSQL("INSERT INTO nodes (" +
            "id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, content, created_at, updated_at) " +
            "VALUES ('node-1', 'topic', 'Node 1', 1, 0, 'blob-1', '', '" + now + "', '" + now + "')");
        packDatabase.execSQL("INSERT INTO content_blobs (" +
            "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
            "original_sha256, stored_sha256, availability, source_device_id, created_at) VALUES (" +
            "'blob-1', 'content/blobs/blob-1', 'text_body', 'text/plain', 'none', 11, 11, " +
            "'sha-original', 'sha-stored', 'missing', 'desktop', '" + now + "')");
        packDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) " +
            "VALUES ('node', 'node-1', 1, 'node-hash', '" + now + "', NULL)");
    }

    private String selectString(String sql) {
        try (Cursor cursor = mainDatabase.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private boolean deletePackFile() {
        return !packFile.exists() || packFile.delete();
    }
}
