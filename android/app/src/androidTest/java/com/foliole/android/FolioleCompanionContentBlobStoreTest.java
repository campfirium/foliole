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
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE nodes (id TEXT PRIMARY KEY, body_blob_hash TEXT, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, last_handled_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT NOT NULL)");
        database.execSQL("CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, body_blob_hash TEXT, updated_at TEXT NOT NULL, is_present INTEGER NOT NULL DEFAULT 1)");
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
        insertNodeRef("node-1", hash, "2026-04-27T00:00:00.000Z");
        OneShotHttpServer server = new OneShotHttpServer(body);
        server.start();

        assertEquals(hash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(0));
        assertEquals(body.getBytes(StandardCharsets.UTF_8).length, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("blobs")
            .getJSONObject(0)
            .getLong("size_bytes"));
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
        insertNodeRef("node-1", referencedNodeHash, "2026-04-27T00:00:00.000Z");
        insertExternalDocumentRef("doc-1", referencedDocumentHash, "2026-04-27T00:00:00.000Z");

        assertEquals(2, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .length());
    }

    @Test
    public void ordersMissingBodyHashesByActiveTopicThenRecentStructure() throws Exception {
        String oldNodeHash = sha256("old node body");
        String activeNodeHash = sha256("active node body");
        String recentNodeHash = sha256("recent node body");
        String documentHash = sha256("document body");
        insertMissingBlob(oldNodeHash);
        insertMissingBlob(activeNodeHash);
        insertMissingBlob(recentNodeHash);
        insertMissingBlob(documentHash);
        insertNodeRef("old-node", oldNodeHash, "2026-04-27T00:00:00.000Z");
        insertNodeRef("active-node", activeNodeHash, "2026-04-26T00:00:00.000Z");
        insertNodeRef("recent-node", recentNodeHash, "2026-04-28T00:00:00.000Z");
        insertExternalDocumentRef("doc-1", documentHash, "2026-04-29T00:00:00.000Z");
        database.execSQL("INSERT INTO workspace_meta (key, value, updated_at) VALUES " +
            "('active_node_id', 'active-node', '2026-04-29T00:00:00.000Z')");

        assertEquals(activeNodeHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(0));
        assertEquals(recentNodeHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(1));
        assertEquals(oldNodeHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(2));
        assertEquals(documentHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(3));
    }

    @Test
    public void ordersDueReviewBodyHashesBeforeOrdinaryRecentTopics() throws Exception {
        String dueReviewHash = sha256("due review body");
        String recentNodeHash = sha256("recent node body");
        String oldNodeHash = sha256("old node body");
        insertMissingBlob(dueReviewHash);
        insertMissingBlob(recentNodeHash);
        insertMissingBlob(oldNodeHash);
        insertNodeRef("due-review-node", dueReviewHash, "2026-04-26T00:00:00.000Z");
        insertNodeRef("recent-node", recentNodeHash, "2026-04-30T00:00:00.000Z");
        insertNodeRef("old-node", oldNodeHash, "2026-04-25T00:00:00.000Z");
        insertReviewDue("due-review-node", "2026-04-20T00:00:00.000Z");

        assertEquals(dueReviewHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(0));
        assertEquals(recentNodeHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(1));
        assertEquals(oldNodeHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(2));
    }

    @Test
    public void ordersOrdinaryTopicBodiesByRecentReadingActivity() throws Exception {
        String recentlyReadHash = sha256("recently read body");
        String recentlyUpdatedHash = sha256("recently updated body");
        insertMissingBlob(recentlyReadHash);
        insertMissingBlob(recentlyUpdatedHash);
        insertNodeRef("recently-read-node", recentlyReadHash, "2026-04-20T00:00:00.000Z");
        insertNodeRef("recently-updated-node", recentlyUpdatedHash, "2026-04-29T00:00:00.000Z");
        insertReading("recently-read-node", "2026-04-30T00:00:00.000Z");

        assertEquals(recentlyReadHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(0));
        assertEquals(recentlyUpdatedHash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(1));
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
            assertEquals("failed", selectString("SELECT availability FROM content_blobs WHERE hash = '" + hash + "'"));
            assertEquals(0, countRows("SELECT COUNT(*) FROM content_blob_data WHERE hash = '" + hash + "'"));
            return;
        }
        throw new AssertionError("Expected content blob hash mismatch.");
    }

    @Test
    public void rejectsBlobBytesThatDoNotMatchManifestSizeAndCompression() throws Exception {
        String body = "expected body";
        String hash = sha256(body);
        insertMissingBlob(hash);
        database.execSQL("UPDATE content_blobs SET stored_size_bytes = 999 WHERE hash = '" + hash + "'");
        OneShotHttpServer server = new OneShotHttpServer(body);
        server.start();

        assertSyncBlobFails(hash, server.url(), "failed");

        database.execSQL("UPDATE content_blobs SET stored_size_bytes = 13, compression = 'deflate' WHERE hash = '" + hash + "'");
        assertSyncBlobFails(hash, server.url(), "failed");
    }

    @Test
    public void retriesFailedReferencedContentBlobs() throws Exception {
        String hash = sha256("retry body");
        insertMissingBlob(hash);
        database.execSQL("UPDATE content_blobs SET availability = 'failed' WHERE hash = '" + hash + "'");
        insertNodeRef("node-1", hash, "2026-04-27T00:00:00.000Z");

        assertEquals(hash, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10)
            .getJSONArray("hashes")
            .getString(0));
    }

    @Test
    public void returnsCachedBlobWithoutDownloadingItAgain() throws Exception {
        String body = "cached body";
        String hash = sha256(body);
        insertMissingBlob(hash);
        insertNodeRef("node-1", hash, "2026-04-27T00:00:00.000Z");
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
        insertMissingBlob(hash, 17);
    }

    private void insertMissingBlob(String hash, int sizeBytes) {
        database.execSQL("INSERT INTO content_blobs (" +
            "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
            "original_sha256, stored_sha256, availability, source_device_id, created_at) VALUES (" +
            "'" + hash + "', 'text/" + hash + "', 'text_body', 'text/plain', 'none', " + sizeBytes + ", " + sizeBytes + ", " +
            "'" + hash + "', '" + hash + "', 'missing', 'desktop', '2026-04-27T00:00:00.000Z')");
    }

    private void insertNodeRef(String nodeId, String hash, String updatedAt) {
        database.execSQL("INSERT INTO nodes (id, body_blob_hash, updated_at, deleted_at) VALUES (" +
            "'" + nodeId + "', '" + hash + "', '" + updatedAt + "', NULL)");
    }

    private void insertExternalDocumentRef(String documentId, String hash, String updatedAt) {
        database.execSQL("INSERT INTO external_documents (document_id, body_blob_hash, updated_at, is_present) VALUES (" +
            "'" + documentId + "', '" + hash + "', '" + updatedAt + "', 1)");
    }

    private void insertReviewDue(String nodeId, String due) {
        database.execSQL("INSERT INTO node_review (node_id, due) VALUES ('" + nodeId + "', '" + due + "')");
    }

    private void insertReading(String nodeId, String lastHandledAt) {
        database.execSQL("INSERT INTO node_reading (node_id, last_handled_at) VALUES ('" + nodeId + "', '" + lastHandledAt + "')");
    }

    private void assertSyncBlobFails(String hash, String url, String expectedAvailability) throws Exception {
        try {
            FolioleCompanionContentBlobStore.syncBlob(database, hash, url, new JSONObject());
        } catch (IllegalStateException expected) {
            assertEquals(expectedAvailability, selectString("SELECT availability FROM content_blobs WHERE hash = '" + hash + "'"));
            assertEquals(0, countRows("SELECT COUNT(*) FROM content_blob_data WHERE hash = '" + hash + "'"));
            return;
        }
        throw new AssertionError("Expected content blob sync failure.");
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
