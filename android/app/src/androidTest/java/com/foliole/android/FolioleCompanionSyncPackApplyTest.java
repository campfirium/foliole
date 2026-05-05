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
        assertEquals(1, result.getInt("to_state_seq"));
        assertEquals("", selectString("SELECT content FROM nodes WHERE id = 'node-1'"));
        assertEquals("Node opening preview", selectString("SELECT opening_text FROM nodes WHERE id = 'node-1'"));
        assertEquals("blob-1", selectString("SELECT body_blob_hash FROM nodes WHERE id = 'node-1'"));
        assertEquals("att-1", selectString("SELECT attachment_id FROM node_attachments WHERE node_id = 'node-1'"));
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
        assertEquals(0, countRows("content_blobs"));
    }

    @Test
    public void appliesExternalDocumentStructureRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingExternalDocumentRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals("", selectString("SELECT content FROM external_documents WHERE document_id = 'folder-1:doc.md'"));
        assertEquals("blob-ext", selectString(
            "SELECT body_blob_hash FROM external_documents WHERE document_id = 'folder-1:doc.md'"
        ));
        assertEquals("External opening", selectString(
            "SELECT opening_text FROM external_documents WHERE document_id = 'folder-1:doc.md'"
        ));
        assertEquals("missing", selectString("SELECT availability FROM content_blobs WHERE hash = 'blob-ext'"));
        assertEquals("android-test", selectString(
            "SELECT last_modified_by_device_id FROM sync_object_state " +
            "WHERE object_type = 'external_document' AND object_id = 'folder-1:doc.md'"
        ));
    }

    @Test
    public void clearsDirtyNodeReviewAfterPackConfirmsAcceptedPushAck() throws Exception {
        createIncomingStateOnlyPack("node_review", "node-1", 7, "review-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('node_review', 'node-1', 4, 'review-hash', 'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");
        mainDatabase.execSQL("INSERT INTO sync_push_ack (" +
            "client_op_id, object_type, object_id, state_seq, status, acked_at) VALUES (" +
            "'node_review:node-1:4', 'node_review', 'node-1', 7, 'accepted', '2026-04-27T00:05:00.000Z')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(0, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_review' AND object_id = 'node-1'"
        ));
        assertEquals(0, countRows("sync_push_ack"));
    }

    @Test
    public void clearsDirtyNodeReadingAfterPackConfirmsAcceptedPushAck() throws Exception {
        createIncomingStateOnlyPack("node_reading", "node-1", 8, "reading-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('node_reading', 'node-1', 5, 'reading-hash', 'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");
        mainDatabase.execSQL("INSERT INTO sync_push_ack (" +
            "client_op_id, object_type, object_id, state_seq, status, acked_at) VALUES (" +
            "'node_reading:node-1:5', 'node_reading', 'node-1', 8, 'accepted', '2026-04-27T00:05:00.000Z')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(0, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-1'"
        ));
        assertEquals(0, countRows("sync_push_ack"));
    }

    @Test
    public void clearsDirtySettingAfterPackConfirmsAcceptedPushAck() throws Exception {
        createIncomingStateOnlyPack("setting", "device:android:phone:*:app_settings", 9, "setting-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('setting', 'device:android:phone:*:app_settings', 6, 'setting-hash', " +
            "'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");
        mainDatabase.execSQL("INSERT INTO sync_push_ack (" +
            "client_op_id, object_type, object_id, state_seq, status, acked_at) VALUES (" +
            "'setting:device:android:phone:*:app_settings:6', 'setting', 'device:android:phone:*:app_settings', " +
            "9, 'accepted', '2026-04-27T00:05:00.000Z')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(0, selectInt(
            "SELECT sync_dirty FROM sync_object_state " +
            "WHERE object_type = 'setting' AND object_id = 'device:android:phone:*:app_settings'"
        ));
        assertEquals(0, countRows("sync_push_ack"));
    }

    @Test
    public void clearsDirtyViewStateAfterPackConfirmsAcceptedPushAck() throws Exception {
        String objectId = "session_resume:android:phone:android-test:active_node";
        createIncomingStateOnlyPack("view_state", objectId, 10, "view-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('view_state', '" + objectId + "', 7, 'view-hash', " +
            "'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");
        mainDatabase.execSQL("INSERT INTO sync_push_ack (" +
            "client_op_id, object_type, object_id, state_seq, status, acked_at) VALUES (" +
            "'view_state:" + objectId + ":7', 'view_state', '" + objectId + "', " +
            "10, 'accepted', '2026-04-27T00:05:00.000Z')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(0, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'view_state' AND object_id = '" + objectId + "'"
        ));
        assertEquals(0, countRows("sync_push_ack"));
    }

    @Test
    public void clearsDirtyAttachmentAfterPackConfirmsAcceptedPushAck() throws Exception {
        createIncomingStateOnlyPack("attachment", "att-1", 11, "attachment-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('attachment', 'att-1', 8, 'attachment-hash', " +
            "'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");
        mainDatabase.execSQL("INSERT INTO sync_push_ack (" +
            "client_op_id, object_type, object_id, state_seq, status, acked_at) VALUES (" +
            "'attachment:att-1:8', 'attachment', 'att-1', 11, 'accepted', '2026-04-27T00:05:00.000Z')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(0, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'attachment' AND object_id = 'att-1'"
        ));
        assertEquals(0, countRows("sync_push_ack"));
    }

    @Test
    public void clearsDirtyExternalFolderAfterPackConfirmsAcceptedPushAck() throws Exception {
        createIncomingStateOnlyPack("external_folder", "folder-1", 12, "external-folder-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('external_folder', 'folder-1', 9, 'external-folder-hash', " +
            "'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");
        mainDatabase.execSQL("INSERT INTO sync_push_ack (" +
            "client_op_id, object_type, object_id, state_seq, status, acked_at) VALUES (" +
            "'external_folder:folder-1:9', 'external_folder', 'folder-1', 12, 'accepted', '2026-04-27T00:05:00.000Z')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(0, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = 'folder-1'"
        ));
        assertEquals(0, countRows("sync_push_ack"));
    }

    @Test
    public void clearsDirtyImportSourceAfterPackConfirmsAcceptedPushAck() throws Exception {
        createIncomingStateOnlyPack("import_source", "source-1", 13, "import-source-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('import_source', 'source-1', 10, 'import-source-hash', " +
            "'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");
        mainDatabase.execSQL("INSERT INTO sync_push_ack (" +
            "client_op_id, object_type, object_id, state_seq, status, acked_at) VALUES (" +
            "'import_source:source-1:10', 'import_source', 'source-1', 13, 'accepted', '2026-04-27T00:05:00.000Z')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(1, result.getInt("applied_object_count"));
        assertEquals(0, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'import_source' AND object_id = 'source-1'"
        ));
        assertEquals(0, countRows("sync_push_ack"));
    }

    @Test
    public void doesNotOverwriteDirtyNodeReviewWithoutConfirmedPushAck() throws Exception {
        createIncomingStateOnlyPack("node_review", "node-1", 7, "desktop-review-hash");
        mainDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, base_content_hash) " +
            "VALUES ('node_review', 'node-1', 4, 'local-review-hash', 'android-local', '2026-04-27T00:04:00.000Z', 1, 'base-hash')");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals(0, result.getInt("applied_object_count"));
        assertEquals(1, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_review' AND object_id = 'node-1'"
        ));
        assertEquals("local-review-hash", selectString(
            "SELECT content_hash FROM sync_object_state WHERE object_type = 'node_review' AND object_id = 'node-1'"
        ));
    }

    @Test
    public void confirmsExistingReviewLogRowsFromIncomingPack() throws Exception {
        createIncomingReviewLogPack();
        mainDatabase.execSQL("INSERT INTO nodes (" +
            "id, kind, title, content, created_at, updated_at) VALUES (" +
            "'node-1', 'topic', 'Node 1', '', '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z')");
        mainDatabase.execSQL("INSERT INTO review_log (" +
            "id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, " +
            "due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after) VALUES (" +
            "'local-log-1', 'op-1', 'android-test', 'node-1', 3, 'ts-fsrs@4', '2026-04-27T00:05:00.000Z', " +
            "'2026-04-27T00:00:00.000Z', 1.0, 2.0, '2026-04-28T00:00:00.000Z', 3.0, 4.0)");

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 4);

        assertEquals("op-1", result.getJSONArray("applied_review_op_ids").getString(0));
        assertEquals(1, selectInt("SELECT COUNT(*) FROM review_log WHERE op_id = 'op-1'"));
    }

    @Test
    public void appliesGenericSettingPayloadRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingSettingRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals("{\"theme\":\"dark\"}", selectString(
            "SELECT value_json FROM setting_records WHERE key = 'app_settings'"
        ));
        assertEquals("setting-hash", selectString(
            "SELECT content_hash FROM sync_object_state " +
            "WHERE object_type = 'setting' AND object_id = 'user_space:windows:desktop:*:app_settings'"
        ));
    }

    @Test
    public void appliesAttachmentMetadataPayloadRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingAttachmentRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals("cover.png", selectString("SELECT original_name FROM attachments WHERE id = 'att-1'"));
        assertEquals("remote_known", selectString("SELECT availability FROM attachment_blobs WHERE attachment_id = 'att-1'"));
        assertEquals("attachment-hash", selectString(
            "SELECT content_hash FROM sync_object_state WHERE object_type = 'attachment' AND object_id = 'att-1'"
        ));
    }

    @Test
    public void appliesNodeReadingPayloadRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingNodeReadingRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals(120000, selectInt(
            "SELECT interval_duration_ms FROM node_reading WHERE node_id = 'node-reading-1'"
        ));
        assertEquals("active", selectString(
            "SELECT state FROM node_reading WHERE node_id = 'node-reading-1'"
        ));
        assertEquals("reading-hash", selectString(
            "SELECT content_hash FROM sync_object_state " +
            "WHERE object_type = 'node_reading' AND object_id = 'node-reading-1'"
        ));
    }

    @Test
    public void appliesNodeReviewPayloadRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingNodeReviewRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals(2, selectInt("SELECT reps FROM node_review WHERE node_id = 'node-review-1'"));
        assertEquals("2026-04-27T00:12:00.000Z", selectString(
            "SELECT last_review_at FROM node_review WHERE node_id = 'node-review-1'"
        ));
        assertEquals("review-hash", selectString(
            "SELECT content_hash FROM sync_object_state " +
            "WHERE object_type = 'node_review' AND object_id = 'node-review-1'"
        ));
    }

    @Test
    public void appliesExternalFolderPayloadRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingExternalFolderRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals("/library", selectString("SELECT folder_path FROM external_search_folders WHERE id = 'folder-1'"));
        assertEquals("external-folder-hash", selectString(
            "SELECT content_hash FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = 'folder-1'"
        ));
    }

    @Test
    public void appliesImportSourcePayloadRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingImportSourceRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals("notes.md", selectString("SELECT source_name FROM import_sources WHERE source_fingerprint = 'source-1'"));
        assertEquals("import-source-hash", selectString(
            "SELECT content_hash FROM sync_object_state WHERE object_type = 'import_source' AND object_id = 'source-1'"
        ));
    }

    @Test
    public void appliesPdfPageTextPayloadRowsFromIncomingPack() throws Exception {
        createIncomingPack();
        appendIncomingPdfPageTextRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(2, result.getInt("applied_object_count"));
        assertEquals("page text", selectString(
            "SELECT text FROM pdf_page_text WHERE attachment_id = 'pdf-1' AND page = 1"
        ));
        assertEquals("pdf-page-text-hash", selectString(
            "SELECT content_hash FROM sync_object_state WHERE object_type = 'pdf_page_text' AND object_id = 'pdf-1:1'"
        ));
    }

    @Test
    public void carriesViewStateRowsButOnlyConsumesCurrentAndroidDevicePayloads() throws Exception {
        createIncomingPack();
        appendIncomingViewStateRows();

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(3, result.getInt("applied_object_count"));
        assertEquals("node-1", selectString("SELECT value FROM workspace_meta WHERE key = 'active_node_id'"));
        assertEquals("view-android-hash", selectString(
            "SELECT content_hash FROM sync_object_state " +
            "WHERE object_type = 'view_state' AND object_id = 'session_resume:android:phone:android-test:active_node'"
        ));
        assertEquals("view-windows-hash", selectString(
            "SELECT content_hash FROM sync_object_state " +
            "WHERE object_type = 'view_state' AND object_id = 'session_resume:windows:desktop:desktop-test:active_node'"
        ));
    }

    private void createMainSchema() {
        mainDatabase.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', title TEXT NOT NULL, " +
            "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
            "content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, opening_text TEXT, created_at TEXT NOT NULL, " +
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
            "form_factor TEXT NOT NULL DEFAULT '*', device_id TEXT NOT NULL DEFAULT '*', " +
            "value_json TEXT NOT NULL, content_hash TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, " +
            "PRIMARY KEY (key, scope, platform, form_factor, device_id))");
        mainDatabase.execSQL("CREATE TABLE attachments (" +
            "id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE node_attachments (" +
            "node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, " +
            "PRIMARY KEY (node_id, attachment_id, role))");
        mainDatabase.execSQL("CREATE TABLE attachment_blobs (" +
            "attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "mime_type TEXT, availability TEXT NOT NULL DEFAULT 'remote_known', source_device_id TEXT, " +
            "created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT)");
        mainDatabase.execSQL("CREATE TABLE pdf_page_text (" +
            "attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '', " +
            "page_width REAL, page_height REAL, PRIMARY KEY (attachment_id, page))");
        mainDatabase.execSQL("CREATE TABLE external_search_folders (" +
            "id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL, " +
            "attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL DEFAULT '[]', " +
            "status TEXT NOT NULL DEFAULT 'idle', document_count INTEGER NOT NULL DEFAULT 0, " +
            "indexed_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE import_sources (" +
            "source_fingerprint TEXT PRIMARY KEY, provider TEXT NOT NULL, source_kind TEXT NOT NULL, " +
            "source_name TEXT NOT NULL, source_locator TEXT NOT NULL, first_imported_at TEXT NOT NULL, " +
            "last_imported_at TEXT NOT NULL, last_content_fingerprint TEXT NOT NULL, latest_node_id TEXT)");
        mainDatabase.execSQL("CREATE TABLE workspace_meta (" +
            "key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)");
        mainDatabase.execSQL("CREATE TABLE node_view_state (" +
            "node_id TEXT NOT NULL, device_id TEXT NOT NULL, scroll_top INTEGER NOT NULL DEFAULT 0, " +
            "selection_from INTEGER, selection_to INTEGER, source TEXT NOT NULL DEFAULT 'restore', " +
            "updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        mainDatabase.execSQL("CREATE TABLE node_reading (" +
            "node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0, " +
            "interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, " +
            "next_at TEXT NOT NULL, priority REAL NOT NULL DEFAULT 0, " +
            "repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active')");
        mainDatabase.execSQL("CREATE TABLE node_reading_device_state (" +
            "node_id TEXT NOT NULL, device_id TEXT NOT NULL, reading_position INTEGER NOT NULL DEFAULT 0, " +
            "updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        mainDatabase.execSQL("CREATE TABLE node_review (" +
            "node_id TEXT PRIMARY KEY, due TEXT NOT NULL, last_review_at TEXT, state INTEGER NOT NULL DEFAULT 0, " +
            "stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0, " +
            "elapsed_days INTEGER NOT NULL DEFAULT 0, scheduled_days INTEGER NOT NULL DEFAULT 0, " +
            "reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0)");
        mainDatabase.execSQL("CREATE TABLE review_log (" +
            "id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, node_id TEXT NOT NULL, " +
            "grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL, reviewed_at TEXT NOT NULL, " +
            "due_before TEXT NOT NULL, stability_before REAL NOT NULL, difficulty_before REAL NOT NULL, " +
            "due_after TEXT NOT NULL, stability_after REAL NOT NULL, difficulty_after REAL NOT NULL)");
    }

    private void createIncomingPack() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openOrCreateDatabase(packFile, null);
        try {
            packDatabase.execSQL("CREATE TABLE pack_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
            packDatabase.execSQL("CREATE TABLE nodes (" +
                "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, " +
                "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
                "body_blob_hash TEXT, opening_text TEXT, content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, " +
                "updated_at TEXT NOT NULL, deleted_at TEXT)");
            packDatabase.execSQL("CREATE TABLE node_attachments (" +
                "node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT, " +
                "PRIMARY KEY (node_id, attachment_id, role))");
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
            packDatabase.execSQL("CREATE TABLE sync_objects (" +
                "object_type TEXT NOT NULL, object_id TEXT NOT NULL, content_hash TEXT NOT NULL, " +
                "payload_json TEXT, updated_at TEXT NOT NULL, deleted_at TEXT, " +
                "PRIMARY KEY (object_type, object_id))");
            insertIncomingRows(packDatabase);
        } finally {
            packDatabase.close();
        }
    }

    private void insertIncomingRows(SQLiteDatabase packDatabase) {
        String now = "2026-04-27T00:00:00.000Z";
        packDatabase.execSQL("INSERT INTO pack_manifest (key, value) VALUES (" +
            "'manifest_json', '{\"to_state_seq\":1}')");
        packDatabase.execSQL("INSERT INTO nodes (" +
            "id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, opening_text, content, created_at, updated_at) " +
            "VALUES ('node-1', 'topic', 'Node 1', 1, 0, 'blob-1', 'Node opening preview', '', '" + now + "', '" + now + "')");
        packDatabase.execSQL("INSERT INTO node_attachments (" +
            "node_id, attachment_id, role, created_at) VALUES ('node-1', 'att-1', 'image', '" + now + "')");
        packDatabase.execSQL("INSERT INTO content_blobs (" +
            "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
            "original_sha256, stored_sha256, availability, source_device_id, created_at) VALUES (" +
            "'blob-1', 'content/blobs/blob-1', 'text_body', 'text/plain', 'none', 11, 11, " +
            "'sha-original', 'sha-stored', 'missing', 'desktop', '" + now + "')");
        packDatabase.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) " +
            "VALUES ('node', 'node-1', 1, 'node-hash', '" + now + "', NULL)");
    }

    private void appendIncomingExternalDocumentRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:00:00.000Z";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO external_documents (" +
                "document_id, folder_id, relative_path, file_name, extension, source_size_bytes, " +
                "source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash, " +
                "content, indexed_at, created_at, updated_at) VALUES (" +
                "'folder-1:doc.md', 'folder-1', 'doc.md', 'doc.md', 'md', 44, '" + now + "', 1777, " +
                "'external-hash', 'External Doc', 'External opening', 'blob-ext', '', '" + now + "', '" + now + "', '" + now + "')");
            packDatabase.execSQL("INSERT INTO content_blobs (" +
                "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
                "original_sha256, stored_sha256, availability, source_device_id, created_at) VALUES (" +
                "'blob-ext', 'content/blobs/blob-ext', 'text_body', 'text/plain', 'none', 44, 44, " +
                "'sha-original-ext', 'sha-stored-ext', 'missing', 'desktop', '" + now + "')");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'external_document', 'folder-1:doc.md', 2, 'external-state-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingSettingRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:06:00.000Z";
            String objectId = "user_space:windows:desktop:*:app_settings";
            String payload = "{\"key\":\"app_settings\",\"scope\":\"user_space\",\"platform\":\"windows\"," +
                "\"form_factor\":\"desktop\",\"device_id\":\"*\",\"value_json\":\"{\\\"theme\\\":\\\"dark\\\"}\"}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'setting', '" + objectId + "', 'setting-hash', '" + payload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'setting', '" + objectId + "', 2, 'setting-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingAttachmentRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:07:00.000Z";
            String payload = "{\"attachment_id\":\"att-1\",\"original_name\":\"cover.png\",\"mime_type\":\"image/png\"," +
                "\"size_bytes\":12,\"created_at\":\"" + now + "\",\"blob\":{\"content_hash\":\"sha256:att-1\"," +
                "\"storage_key\":\"attachments/sha256-att-1.png\",\"size_bytes\":12,\"mime_type\":\"image/png\"," +
                "\"availability\":\"local\",\"source_device_id\":\"desktop-test\",\"created_at\":\"" + now + "\"}}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'attachment', 'att-1', 'attachment-hash', '" + payload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'attachment', 'att-1', 2, 'attachment-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingNodeReadingRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:12:00.000Z";
            String payload = "{\"node_id\":\"node-reading-1\",\"interval_duration_ms\":120000," +
                "\"interval_growth_factor\":1.5,\"last_handled_at\":\"" + now + "\"," +
                "\"next_at\":\"2026-04-28T00:12:00.000Z\",\"priority\":0.75," +
                "\"repetition_count\":2,\"state\":\"active\"}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'node_reading', 'node-reading-1', 'reading-hash', '" + payload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'node_reading', 'node-reading-1', 2, 'reading-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingNodeReviewRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:12:00.000Z";
            String payload = "{\"node_id\":\"node-review-1\",\"due\":\"2026-04-28T00:12:00.000Z\"," +
                "\"last_review_at\":\"" + now + "\",\"state\":2,\"stability\":3.0," +
                "\"difficulty\":4.0,\"elapsed_days\":1,\"scheduled_days\":1,\"reps\":2,\"lapses\":0}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'node_review', 'node-review-1', 'review-hash', '" + payload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'node_review', 'node-review-1', 2, 'review-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingExternalFolderRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:08:00.000Z";
            String payload = "{\"id\":\"folder-1\",\"folder_path\":\"/library\"," +
                "\"attachment_mode\":\"document_relative_first_then_fixed_root\",\"attachment_root_path\":null," +
                "\"excluded_dirs_json\":\"[\\\".git\\\"]\",\"status\":\"ready\",\"document_count\":3," +
                "\"indexed_at\":\"" + now + "\",\"last_error\":null,\"created_at\":\"" + now + "\"," +
                "\"updated_at\":\"" + now + "\"}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'external_folder', 'folder-1', 'external-folder-hash', '" + payload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'external_folder', 'folder-1', 2, 'external-folder-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingImportSourceRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:09:00.000Z";
            String payload = "{\"source_fingerprint\":\"source-1\",\"provider\":\"manual\"," +
                "\"source_kind\":\"markdown\",\"source_name\":\"notes.md\"," +
                "\"source_locator\":\"/library/notes.md\",\"first_imported_at\":\"" + now + "\"," +
                "\"last_imported_at\":\"" + now + "\",\"last_content_fingerprint\":\"content-1\"," +
                "\"latest_node_id\":\"node-1\"}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'import_source', 'source-1', 'import-source-hash', '" + payload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'import_source', 'source-1', 2, 'import-source-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingPdfPageTextRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:11:00.000Z";
            String payload = "{\"attachment_id\":\"pdf-1\",\"page\":1,\"text\":\"page text\"," +
                "\"page_width\":612,\"page_height\":792}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":2}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'pdf_page_text', 'pdf-1:1', 'pdf-page-text-hash', '" + payload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'pdf_page_text', 'pdf-1:1', 2, 'pdf-page-text-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void appendIncomingViewStateRows() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = "2026-04-27T00:10:00.000Z";
            String androidObjectId = "session_resume:android:phone:android-test:active_node";
            String windowsObjectId = "session_resume:windows:desktop:desktop-test:active_node";
            String androidPayload = "{\"active_node_id\":\"node-1\"}";
            String windowsPayload = "{\"active_node_id\":\"node-windows\"}";
            packDatabase.execSQL("UPDATE pack_manifest SET value = '{\"to_state_seq\":3}' WHERE key = 'manifest_json'");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'view_state', '" + androidObjectId + "', 'view-android-hash', '" + androidPayload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_objects (" +
                "object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (" +
                "'view_state', '" + windowsObjectId + "', 'view-windows-hash', '" + windowsPayload + "', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'view_state', '" + androidObjectId + "', 2, 'view-android-hash', '" + now + "', NULL)");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'view_state', '" + windowsObjectId + "', 3, 'view-windows-hash', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void createIncomingStateOnlyPack(String objectType, String objectId, int stateSeq, String contentHash) {
        SQLiteDatabase packDatabase = SQLiteDatabase.openOrCreateDatabase(packFile, null);
        try {
            String now = "2026-04-27T00:05:00.000Z";
            packDatabase.execSQL("CREATE TABLE pack_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
            packDatabase.execSQL("CREATE TABLE nodes (" +
                "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, " +
                "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
                "body_blob_hash TEXT, opening_text TEXT, content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, " +
                "updated_at TEXT NOT NULL, deleted_at TEXT)");
            packDatabase.execSQL("CREATE TABLE node_attachments (" +
                "node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT, " +
                "PRIMARY KEY (node_id, attachment_id, role))");
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
            packDatabase.execSQL("CREATE TABLE sync_objects (" +
                "object_type TEXT NOT NULL, object_id TEXT NOT NULL, content_hash TEXT NOT NULL, " +
                "payload_json TEXT, updated_at TEXT NOT NULL, deleted_at TEXT, " +
                "PRIMARY KEY (object_type, object_id))");
            packDatabase.execSQL("INSERT INTO pack_manifest (key, value) VALUES (" +
                "'manifest_json', '{\"from_state_seq\":4,\"to_state_seq\":" + stateSeq + "}')");
            packDatabase.execSQL("INSERT INTO sync_object_state (" +
                "object_type, object_id, state_seq, content_hash, updated_at, deleted_at) VALUES (" +
                "'" + objectType + "', '" + objectId + "', " + stateSeq + ", '" + contentHash + "', '" + now + "', NULL)");
        } finally {
            packDatabase.close();
        }
    }

    private void createIncomingReviewLogPack() {
        createIncomingStateOnlyPack("node_review", "node-1", 7, "review-hash");
        SQLiteDatabase packDatabase = SQLiteDatabase.openDatabase(packFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
        try {
            packDatabase.execSQL("CREATE TABLE review_log (" +
                "id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, node_id TEXT NOT NULL, " +
                "grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL, reviewed_at TEXT NOT NULL, " +
                "due_before TEXT NOT NULL, stability_before REAL NOT NULL, difficulty_before REAL NOT NULL, " +
                "due_after TEXT NOT NULL, stability_after REAL NOT NULL, difficulty_after REAL NOT NULL)");
            packDatabase.execSQL("INSERT INTO review_log (" +
                "id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, " +
                "due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after) VALUES (" +
                "'desktop-log-1', 'op-1', 'android-test', 'node-1', 3, 'ts-fsrs@4', '2026-04-27T00:05:00.000Z', " +
                "'2026-04-27T00:00:00.000Z', 1.0, 2.0, '2026-04-28T00:00:00.000Z', 3.0, 4.0)");
        } finally {
            packDatabase.close();
        }
    }

    private String selectString(String sql) {
        try (Cursor cursor = mainDatabase.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private int selectInt(String sql) {
        try (Cursor cursor = mainDatabase.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private int countRows(String table) {
        try (Cursor cursor = mainDatabase.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private boolean deletePackFile() {
        return !packFile.exists() || packFile.delete();
    }
}
