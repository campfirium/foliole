package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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
import java.nio.charset.StandardCharsets;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionAttachmentResourceBatchCommitStoreTest {
    private Context context;
    private SQLiteDatabase database;
    private File attachmentsDir;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE attachment_blobs (" +
            "attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "mime_type TEXT, availability TEXT NOT NULL DEFAULT 'remote_known', source_device_id TEXT, " +
            "created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT)");
        attachmentsDir = new File(context.getFilesDir(), "attachments");
        deleteRecursively(attachmentsDir);
    }

    @After
    public void tearDown() {
        database.close();
        deleteRecursively(attachmentsDir);
    }

    @Test
    public void movesTempFileToCasAndMarksCached() throws Exception {
        String body = "attachment batch bytes";
        String hash = sha256(body);
        insertManifest("att-1", hash);
        File temp = writeTemp(hash, body);
        String token = createSession("att-1", hash, temp);

        JSObject first = FolioleCompanionAttachmentResourceBatchCommitStore.commitDownloadedResources(context, database, token);
        JSObject second = FolioleCompanionAttachmentResourceBatchCommitStore.commitDownloadedResources(context, database, token);

        assertEquals("att-1", first.getJSONArray("synced_attachment_ids").getString(0));
        assertEquals("att-1", second.getJSONArray("synced_attachment_ids").getString(0));
        assertEquals("cached", selectString("SELECT availability FROM attachment_blobs WHERE attachment_id = 'att-1'"));
        assertTrue(new File(attachmentsDir, hash).exists());
        assertFalse(temp.exists());
    }

    @Test
    public void marksMissingManifestAsFailedWithoutFinalCasFile() throws Exception {
        String hash = sha256("orphan bytes");
        File temp = writeTemp(hash, "orphan bytes");
        String token = createSession("missing-att", hash, temp);

        JSObject result = FolioleCompanionAttachmentResourceBatchCommitStore.commitDownloadedResources(context, database, token);

        assertEquals(0, result.getJSONArray("synced_attachment_ids").length());
        assertFalse(new File(attachmentsDir, hash).exists());
        assertFalse(temp.exists());
    }

    private String createSession(String attachmentId, String hash, File temp) {
        Map<String, File> tempFiles = new HashMap<>();
        tempFiles.put(attachmentId, temp);
        Map<String, String> hashes = new HashMap<>();
        hashes.put(attachmentId, hash);
        return FolioleCompanionAttachmentResourceBatchSessions.create(tempFiles, hashes, new ArrayList<>());
    }

    private void insertManifest(String attachmentId, String hash) {
        database.execSQL("INSERT INTO attachment_blobs (" +
            "attachment_id, content_hash, size_bytes, mime_type, availability, source_device_id, created_at) VALUES (" +
            "'" + attachmentId + "', '" + hash + "', 10, 'application/pdf', 'remote_known', 'desktop', " +
            "'2026-04-27T00:00:00.000Z')");
    }

    private File writeTemp(String hash, String body) throws Exception {
        File dir = new File(attachmentsDir, ".tmp/test-" + hash);
        assertTrue(dir.mkdirs());
        File file = new File(dir, hash);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(body.getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    private String selectString(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private static String sha256(String value) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();
        for (byte item : hash) builder.append(String.format("%02x", item));
        return builder.toString();
    }

    private static void deleteRecursively(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }
}
