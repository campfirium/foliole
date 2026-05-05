package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionContentBlobStoreTest {

    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
            "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
        database.execSQL("CREATE TABLE nodes (id TEXT PRIMARY KEY, body_blob_hash TEXT)");
        database.execSQL("CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, body_blob_hash TEXT)");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void syncsMissingContentBlobAndMarksItCached() throws Exception {
        String body = "Blob article body";
        String hash = sha256(body);
        insertMissingBlob(hash);
        database.execSQL("INSERT INTO nodes (id, body_blob_hash) VALUES ('node-1', '" + hash + "')");
        OneShotHttpServer server = new OneShotHttpServer(body);
        server.start();

        assertEquals(hash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(0));
        JSObject result = FolioleCompanionContentBlobStore.syncBlob(database, hash, server.url(), new JSONObject());

        assertEquals("cached", result.getString("availability"));
        assertEquals("cached", selectString("SELECT availability FROM content_blobs WHERE hash = '" + hash + "'"));
        assertEquals(body, selectString("SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = '" + hash + "'"));
        assertEquals(0, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10).getJSONArray("hashes").length());
        assertEquals("GET", server.method());
    }

    @Test
    public void onlyListsMissingBlobHashesStillReferencedByStructureRows() throws Exception {
        String referencedNodeHash = sha256("referenced node body");
        String referencedDocumentHash = sha256("referenced document body");
        String unreferencedHash = sha256("stale body");
        insertMissingBlob(referencedNodeHash);
        insertMissingBlob(referencedDocumentHash);
        insertMissingBlob(unreferencedHash);
        database.execSQL("INSERT INTO nodes (id, body_blob_hash) VALUES ('node-1', '" + referencedNodeHash + "')");
        database.execSQL("INSERT INTO external_documents (document_id, body_blob_hash) VALUES " +
            "('doc-1', '" + referencedDocumentHash + "')");

        assertEquals(2, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .length());
    }

    @Test
    public void rejectsBlobBytesThatDoNotMatchTheManifestHash() throws Exception {
        String hash = sha256("expected body");
        insertMissingBlob(hash);
        OneShotHttpServer server = new OneShotHttpServer("different body");
        server.start();

        try {
            FolioleCompanionContentBlobStore.syncBlob(database, hash, server.url(), new JSONObject());
        } catch (IllegalStateException expected) {
            assertEquals("missing", selectString("SELECT availability FROM content_blobs WHERE hash = '" + hash + "'"));
            assertEquals(0, countRows("SELECT COUNT(*) FROM content_blob_data WHERE hash = '" + hash + "'"));
            return;
        }
        throw new AssertionError("Expected content blob hash mismatch.");
    }

    @Test
    public void returnsCachedBlobWithoutDownloadingItAgain() throws Exception {
        String body = "cached body";
        String hash = sha256(body);
        insertMissingBlob(hash);
        database.execSQL("INSERT INTO nodes (id, body_blob_hash) VALUES ('node-1', '" + hash + "')");
        database.execSQL("INSERT INTO content_blob_data (hash, data) VALUES ('" + hash + "', CAST('" + body + "' AS BLOB))");

        JSObject result = FolioleCompanionContentBlobStore.syncBlob(
            database,
            hash,
            "http://127.0.0.1:1/content-blob",
            new JSONObject()
        );

        assertEquals("cached", result.getString("availability"));
        assertEquals("cached", selectString("SELECT availability FROM content_blobs WHERE hash = '" + hash + "'"));
    }


    private void insertMissingBlob(String hash) {
        database.execSQL("INSERT INTO content_blobs (" +
            "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
            "original_sha256, stored_sha256, availability, source_device_id, created_at) VALUES (" +
            "'" + hash + "', 'text/" + hash + "', 'text_body', 'text/plain', 'none', 17, 17, " +
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
        for (byte item : hash) {
            builder.append(String.format("%02x", item));
        }
        return builder.toString();
    }

    private static final class OneShotHttpServer {
        private final byte[] body;
        private ServerSocket serverSocket;
        private Thread thread;
        private String method;

        OneShotHttpServer(String body) {
            this.body = body.getBytes(StandardCharsets.UTF_8);
        }

        void start() throws Exception {
            serverSocket = new ServerSocket(0);
            thread = new Thread(this::serve);
            thread.start();
        }

        String url() {
            return "http://127.0.0.1:" + serverSocket.getLocalPort() + "/content-blob";
        }

        String method() throws Exception {
            thread.join(5000);
            return method;
        }

        private void serve() {
            try (Socket socket = serverSocket.accept();
                 BufferedReader reader = new BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                 OutputStream output = socket.getOutputStream()) {
                method = reader.readLine().split(" ")[0];
                output.write(("HTTP/1.1 200 OK\r\nContent-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                output.write(body);
            } catch (Exception ignored) {
            }
        }
    }
}
