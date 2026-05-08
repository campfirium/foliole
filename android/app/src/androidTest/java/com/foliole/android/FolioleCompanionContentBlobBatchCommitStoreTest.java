package com.foliole.android;

import static org.junit.Assert.assertEquals;

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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionContentBlobBatchCommitStoreTest {
    private Context context;
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
            "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void commitsValidBlobsAndMarksPerBlobFailures() throws Exception {
        String goodBody = "good batch body";
        String badBody = "bad actual body";
        String goodHash = sha256(goodBody);
        String badHash = sha256("bad expected body");
        String networkFailedHash = sha256("network failed body");
        insertMissingBlob(goodHash, goodBody.length());
        insertMissingBlob(badHash, badBody.length());
        insertMissingBlob(networkFailedHash, 19);

        FolioleCompanionContentBlobBatchCommitStore.storeDownloadedBlobs(context, database, Arrays.asList(
            blob(goodHash, goodBody),
            blob(badHash, badBody)
        ), Arrays.asList(networkFailedHash));

        assertEquals("cached", selectString("SELECT availability FROM content_blobs WHERE hash = '" + goodHash + "'"));
        assertEquals("failed", selectString("SELECT availability FROM content_blobs WHERE hash = '" + badHash + "'"));
        assertEquals("failed", selectString("SELECT availability FROM content_blobs WHERE hash = '" + networkFailedHash + "'"));
        assertEquals(goodBody, selectString("SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = '" + goodHash + "'"));
    }

    @Test
    public void duplicateCommitReturnsNoOpResultForKnownCommittedToken() throws Exception {
        String body = "duplicate commit body";
        String hash = sha256(body);
        insertMissingBlob(hash, body.length());
        String token = FolioleCompanionContentBlobBatchSessions.create(
            Arrays.asList(blob(hash, body)),
            new ArrayList<>()
        );

        JSObject first = FolioleCompanionContentBlobBatchCommitStore.commitDownloadedBlobs(context, database, token);
        JSObject second = FolioleCompanionContentBlobBatchCommitStore.commitDownloadedBlobs(context, database, token);

        assertEquals(hash, first.getJSONArray("synced_hashes").getString(0));
        assertEquals(hash, second.getJSONArray("synced_hashes").getString(0));
        assertEquals(1, countRows("SELECT COUNT(*) FROM content_blob_data WHERE hash = '" + hash + "'"));
    }

    private FolioleCompanionContentBlobMultipartBatch.Blob blob(String hash, String body) {
        return new FolioleCompanionContentBlobMultipartBatch.Blob(hash, body.getBytes(StandardCharsets.UTF_8));
    }

    private void insertMissingBlob(String hash, int sizeBytes) {
        database.execSQL("INSERT INTO content_blobs (" +
            "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
            "original_sha256, stored_sha256, availability, source_device_id, created_at) VALUES (" +
            "'" + hash + "', 'text/" + hash + "', 'text_body', 'text/plain', 'none', " + sizeBytes + ", " + sizeBytes + ", " +
            "'" + hash + "', '" + hash + "', 'missing', 'desktop', '2026-04-27T00:00:00.000Z')");
    }

    private String selectString(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private int countRows(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private static String sha256(String value) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();
        for (byte item : hash) builder.append(String.format("%02x", item));
        return builder.toString();
    }
}
