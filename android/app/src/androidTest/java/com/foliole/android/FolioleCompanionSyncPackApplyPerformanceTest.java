package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.os.SystemClock;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncPackApplyPerformanceTest {
    private static final String TAG = "FolioleSyncApplyPerf";
    private static final int NODE_COUNT = 1000;
    private static final int BLOB_COUNT = 100;
    private static final String NOW = "2026-05-04T00:00:00.000Z";

    private SQLiteDatabase mainDatabase;
    private File packFile;

    @Before
    public void setUp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        mainDatabase = SQLiteDatabase.create(null);
        packFile = new File(context.getCacheDir(), "sync-pack-apply-performance.db");
        deletePackFile();
        createMainSchema();
        createIncomingPack();
    }

    @After
    public void tearDown() {
        if (mainDatabase != null && mainDatabase.isOpen()) {
            mainDatabase.close();
        }
        deletePackFile();
    }

    @Test
    public void recordsJavaApplyBaselineForNodesAndContentBlobs() throws Exception {
        long startedAt = SystemClock.elapsedRealtime();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-baseline");

        long elapsedMs = SystemClock.elapsedRealtime() - startedAt;
        assertEquals(NODE_COUNT, result.getInt("applied_object_count"));
        assertEquals(BLOB_COUNT, result.getInt("applied_blob_count"));
        assertEquals(NODE_COUNT, countRows("nodes"));
        assertEquals(BLOB_COUNT, countRows("content_blobs"));
        Log.i(TAG, "javaApplyBaseline nodes=" + NODE_COUNT + " contentBlobs=" + BLOB_COUNT + " elapsedMs=" + elapsedMs);
    }

    private void createMainSchema() {
        mainDatabase.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', title TEXT NOT NULL, " +
            "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
            "content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, opening_text TEXT, current_version_id TEXT, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0)");
        mainDatabase.execSQL("CREATE TABLE external_documents (" +
            "document_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, relative_path TEXT NOT NULL, " +
            "file_name TEXT NOT NULL, extension TEXT NOT NULL, source_size_bytes INTEGER NOT NULL, " +
            "source_modified_at TEXT NOT NULL, source_modified_ms INTEGER NOT NULL, content_hash TEXT NOT NULL, " +
            "title TEXT, opening_text TEXT, body_blob_hash TEXT, content TEXT NOT NULL DEFAULT '', " +
            "indexed_at TEXT NOT NULL, is_present INTEGER NOT NULL DEFAULT 1, missing_at TEXT, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE node_attachments (" +
            "node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, " +
            "PRIMARY KEY (node_id, attachment_id, role))");
        mainDatabase.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
            "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
        mainDatabase.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE sync_object_state (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, " +
            "current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, base_content_hash TEXT, " +
            "PRIMARY KEY (object_type, object_id), UNIQUE (state_seq))");
        mainDatabase.execSQL("CREATE TABLE sync_push_ack (" +
            "client_op_id TEXT PRIMARY KEY NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL, " +
            "state_seq INTEGER, status TEXT NOT NULL, acked_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE setting_records (" +
            "key TEXT NOT NULL, scope TEXT NOT NULL, platform TEXT NOT NULL DEFAULT '*', " +
            "form_factor TEXT NOT NULL DEFAULT '*', device_id TEXT NOT NULL DEFAULT '*', value_json TEXT NOT NULL, " +
            "content_hash TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, " +
            "PRIMARY KEY (key, scope, platform, form_factor, device_id))");
        mainDatabase.execSQL("CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, " +
            "size_bytes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE attachment_blobs (" +
            "attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "mime_type TEXT, availability TEXT NOT NULL DEFAULT 'remote_known', source_device_id TEXT, " +
            "created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT)");
        mainDatabase.execSQL("CREATE TABLE pdf_page_text (" +
            "attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '', " +
            "page_width REAL, page_height REAL, PRIMARY KEY (attachment_id, page))");
        mainDatabase.execSQL("CREATE TABLE external_search_folders (" +
            "id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL, attachment_root_path TEXT, " +
            "excluded_dirs_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'idle', " +
            "document_count INTEGER NOT NULL DEFAULT 0, indexed_at TEXT, last_error TEXT, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE import_sources (" +
            "source_fingerprint TEXT PRIMARY KEY, provider TEXT NOT NULL, source_kind TEXT NOT NULL, " +
            "source_name TEXT NOT NULL, source_locator TEXT NOT NULL, first_imported_at TEXT NOT NULL, " +
            "last_imported_at TEXT NOT NULL, last_content_fingerprint TEXT NOT NULL, latest_node_id TEXT)");
        mainDatabase.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE node_view_state (" +
            "node_id TEXT NOT NULL, device_id TEXT NOT NULL, scroll_top INTEGER NOT NULL DEFAULT 0, " +
            "selection_from INTEGER, selection_to INTEGER, source TEXT NOT NULL DEFAULT 'restore', " +
            "updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        mainDatabase.execSQL("CREATE TABLE node_reading (" +
            "node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0, " +
            "interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL, " +
            "priority REAL NOT NULL DEFAULT 0, repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active')");
        mainDatabase.execSQL("CREATE TABLE node_reading_device_state (" +
            "node_id TEXT NOT NULL, device_id TEXT NOT NULL, reading_position INTEGER NOT NULL DEFAULT 0, " +
            "updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        mainDatabase.execSQL("CREATE TABLE node_review (" +
            "node_id TEXT PRIMARY KEY, due TEXT NOT NULL, last_review_at TEXT, state INTEGER NOT NULL DEFAULT 0, " +
            "stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0, elapsed_days INTEGER NOT NULL DEFAULT 0, " +
            "scheduled_days INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0)");
        mainDatabase.execSQL("CREATE TABLE review_log (" +
            "id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, node_id TEXT NOT NULL, " +
            "grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL, reviewed_at TEXT NOT NULL, due_before TEXT NOT NULL, " +
            "stability_before REAL NOT NULL, difficulty_before REAL NOT NULL, due_after TEXT NOT NULL, " +
            "stability_after REAL NOT NULL, difficulty_after REAL NOT NULL)");
    }

    private void createIncomingPack() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openOrCreateDatabase(packFile, null);
        try {
            createPackSchema(packDatabase);
            insertPackRows(packDatabase);
        } finally {
            packDatabase.close();
        }
    }

    private void createPackSchema(SQLiteDatabase database) {
        database.execSQL("CREATE TABLE pack_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, " +
            "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
            "body_blob_hash TEXT, opening_text TEXT, content TEXT NOT NULL DEFAULT '', current_version_id TEXT, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_attachments (" +
            "node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT, " +
            "PRIMARY KEY (node_id, attachment_id, role))");
        database.execSQL("CREATE TABLE external_documents (" +
            "document_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, relative_path TEXT NOT NULL, file_name TEXT NOT NULL, " +
            "extension TEXT NOT NULL, source_size_bytes INTEGER NOT NULL, source_modified_at TEXT NOT NULL, " +
            "source_modified_ms INTEGER NOT NULL, content_hash TEXT NOT NULL, title TEXT, opening_text TEXT, " +
            "body_blob_hash TEXT, content TEXT NOT NULL DEFAULT '', indexed_at TEXT NOT NULL, is_present INTEGER NOT NULL DEFAULT 1, " +
            "missing_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, stored_size_bytes INTEGER NOT NULL, " +
            "original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, availability TEXT NOT NULL DEFAULT 'missing', " +
            "source_device_id TEXT, created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE sync_object_state (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, content_hash TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY (object_type, object_id))");
        database.execSQL("CREATE TABLE sync_objects (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, content_hash TEXT NOT NULL, payload_json TEXT, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY (object_type, object_id))");
    }

    private void insertPackRows(SQLiteDatabase database) {
        database.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', '{\"from_state_seq\":0,\"to_state_seq\":" + NODE_COUNT + "}')");
        database.beginTransaction();
        try {
            for (int index = 0; index < NODE_COUNT; index += 1) {
                insertNode(database, index);
            }
            for (int index = 0; index < BLOB_COUNT; index += 1) {
                insertBlob(database, index);
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private void insertNode(SQLiteDatabase database, int index) {
        String nodeId = "node-" + index;
        String blobHash = index < BLOB_COUNT ? "blob-" + index : null;
        database.execSQL("INSERT INTO nodes (id, kind, title, body_blob_hash, opening_text, content, current_version_id, created_at, updated_at) " +
            "VALUES (?, 'topic', ?, ?, ?, '', ?, ?, ?)", new Object[] {
                nodeId, "Node " + index, blobHash, "Opening " + index, "desktop#" + nodeId + "-v1", NOW, NOW
            });
        database.execSQL("INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, deleted_at) " +
            "VALUES ('node', ?, ?, ?, ?, NULL)", new Object[] { nodeId, index + 1, "node-hash-" + index, NOW });
    }

    private void insertBlob(SQLiteDatabase database, int index) {
        String hash = "blob-" + index;
        database.execSQL("INSERT INTO content_blobs (" +
            "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
            "original_sha256, stored_sha256, availability, source_device_id, created_at) " +
            "VALUES (?, ?, 'text_body', 'text/plain', 'none', 1024, 1024, ?, ?, 'missing', 'desktop', ?)", new Object[] {
                hash, "content/blobs/" + hash, "original-sha-" + index, "stored-sha-" + index, NOW
            });
    }

    private int countRows(String tableName) {
        try (android.database.Cursor cursor = mainDatabase.rawQuery("SELECT COUNT(*) FROM " + tableName, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private void deletePackFile() {
        if (packFile != null && packFile.exists() && !packFile.delete()) {
            throw new IllegalStateException("Could not delete " + packFile.getAbsolutePath());
        }
    }
}
