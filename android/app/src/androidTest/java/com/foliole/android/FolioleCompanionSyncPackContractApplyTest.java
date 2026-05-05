package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

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
import java.io.FileOutputStream;
import java.io.InputStream;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncPackContractApplyTest {
    private Context context;
    private SQLiteDatabase mainDatabase;
    private File packFile;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        mainDatabase = SQLiteDatabase.create(null);
        packFile = new File(context.getCacheDir(), "sync-pack-contract.syncpack");
        deletePackFile();
        createMainSchema();
    }

    @After
    public void tearDown() {
        if (mainDatabase != null && mainDatabase.isOpen()) {
            mainDatabase.close();
        }
        deletePackFile();
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
    }

    @Test
    public void appliesDesktopBuilderContractSyncPackContainer() throws Exception {
        copyTestAsset("sync-pack-contract.syncpack", packFile);

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test");

        assertEquals(3, result.getInt("applied_object_count"));
        assertEquals(2, result.getInt("applied_blob_count"));
        assertEquals(3, result.getInt("to_state_seq"));
        assertEquals("", selectString("SELECT content FROM nodes WHERE id = 'node-1'"));
        assertEquals("", selectString("SELECT content FROM external_documents WHERE document_id = 'folder-1:doc.md'"));
        assertEquals(2, countRows("content_blobs"));
        assertEquals(0, countRows("content_blob_data"));
        assertEquals(3, countRows("sync_object_state"));
        assertEquals(1, countRows("node_attachments"));
        assertEquals("{\"theme\":\"dark\"}", selectString(
            "SELECT value_json FROM setting_records WHERE key = 'app_settings'"
        ));
    }

    @Test
    public void skipsDesktopBuilderContractPackWhenCursorAlreadyCoversIt() throws Exception {
        copyTestAsset("sync-pack-contract.syncpack", packFile);

        JSObject result = FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 3);

        assertEquals(0, result.getInt("applied_object_count"));
        assertEquals(0, result.getInt("applied_blob_count"));
        assertEquals(3, result.getInt("to_state_seq"));
        assertEquals(0, countRows("nodes"));
        assertEquals(0, countRows("external_documents"));
        assertEquals(0, countRows("content_blobs"));
        assertEquals(0, countRows("sync_object_state"));
    }

    @Test
    public void rejectsNonContiguousDesktopBuilderContractPackWithoutApplyingRows() throws Exception {
        copyTestAsset("sync-pack-contract.syncpack", packFile);

        assertThrows(IllegalArgumentException.class, () ->
            FolioleCompanionSyncPackApply.applyPack(mainDatabase, packFile, "android-test", 1)
        );

        assertEquals(0, countRows("nodes"));
        assertEquals(0, countRows("external_documents"));
        assertEquals(0, countRows("content_blobs"));
        assertEquals(0, countRows("sync_object_state"));
    }

    @Test
    public void databaseHelperAdvancesPackCursorOnlyAfterSuccessfulApply() throws Exception {
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
        copyTestAsset("sync-pack-contract.syncpack", packFile);
        FolioleCompanionDatabaseHelper helper = new FolioleCompanionDatabaseHelper(context);
        try {
            JSObject first = helper.applySyncPack(packFile.getAbsolutePath());
            JSObject second = helper.applySyncPack(packFile.getAbsolutePath());

            assertEquals(3, first.getInt("applied_object_count"));
            assertEquals(0, second.getInt("applied_object_count"));
            assertEquals(3, helper.loadSyncPackCursor().getInt("cursor"));
        } finally {
            helper.close();
        }
    }

    private void createMainSchema() {
        mainDatabase.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', title TEXT NOT NULL, " +
            "is_title_manual INTEGER NOT NULL DEFAULT 0, hide_title_heading INTEGER NOT NULL DEFAULT 0, " +
            "content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, opening_text TEXT, current_version_id TEXT, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
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
        mainDatabase.execSQL("CREATE TABLE node_attachments (" +
            "node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, " +
            "PRIMARY KEY (node_id, attachment_id, role))");
    }

    private String selectString(String sql) {
        try (Cursor cursor = mainDatabase.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private int countRows(String table) {
        try (Cursor cursor = mainDatabase.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private void copyTestAsset(String name, File target) throws Exception {
        try (
            InputStream inputStream = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name);
            FileOutputStream outputStream = new FileOutputStream(target)
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
        }
    }

    private boolean deletePackFile() {
        return !packFile.exists() || packFile.delete();
    }
}
