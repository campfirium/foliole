package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;

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
public class FolioleCompanionReadableArticleBlobSyncTest {
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        createTables();
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void syncedContentBlobMakesMissingReadableArticleReady() throws Exception {
        String body = "# Synced topic\n\nLong body arrived after the structure pack.";
        String hash = sha256(body);
        insertMissingBodyManifest(hash, body.getBytes(StandardCharsets.UTF_8).length);
        database.execSQL(
            "INSERT INTO nodes (id, title, content, body_blob_hash, created_at, updated_at) " +
                "VALUES ('article-1', 'Synced topic', '', '" + hash + "', " +
                "'2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z')"
        );
        database.execSQL(
            "INSERT INTO workspace_meta (key, value, updated_at) " +
                "VALUES ('active_node_id', 'article-1', '2026-04-27T00:00:00.000Z')"
        );

        assertEquals("missing", loadReadableContentStatus());

        OneShotHttpServer server = new OneShotHttpServer(body);
        server.start();
        FolioleCompanionContentBlobStore.syncBlob(database, hash, server.url(), new JSONObject());

        assertEquals("ready", loadReadableContentStatus());
        assertEquals(body, loadReadableContent());
        assertEquals(0, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10).getJSONArray("hashes").length());
    }

    @Test
    public void failedContentBlobSyncLeavesReadableArticleFailedAndRetryable() throws Exception {
        String expectedBody = "# Synced topic\n\nExpected body.";
        String hash = sha256(expectedBody);
        insertMissingBodyManifest(hash, expectedBody.getBytes(StandardCharsets.UTF_8).length);
        database.execSQL(
            "INSERT INTO nodes (id, title, content, body_blob_hash, created_at, updated_at) " +
                "VALUES ('article-1', 'Synced topic', '', '" + hash + "', " +
                "'2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z')"
        );
        database.execSQL(
            "INSERT INTO workspace_meta (key, value, updated_at) " +
                "VALUES ('active_node_id', 'article-1', '2026-04-27T00:00:00.000Z')"
        );

        OneShotHttpServer server = new OneShotHttpServer("wrong body");
        server.start();
        try {
            FolioleCompanionContentBlobStore.syncBlob(database, hash, server.url(), new JSONObject());
        } catch (IllegalStateException expected) {
            assertEquals("failed", loadReadableContentStatus());
            assertEquals(1, FolioleCompanionContentBlobStore.loadMissingHashes(database, 10).getJSONArray("hashes").length());
            return;
        }
        throw new AssertionError("Expected content blob sync failure.");
    }

    private void createTables() {
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', " +
            "body_blob_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
            "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE attachments (id TEXT PRIMARY KEY, mime_type TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT)");
        database.execSQL("CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT)");
        database.execSQL("CREATE TABLE external_documents (" +
            "document_id TEXT PRIMARY KEY, body_blob_hash TEXT, updated_at TEXT NOT NULL, is_present INTEGER NOT NULL DEFAULT 1)");
    }

    private void insertMissingBodyManifest(String hash, int sizeBytes) {
        database.execSQL("INSERT INTO content_blobs (" +
            "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
            "original_sha256, stored_sha256, availability, source_device_id, created_at) VALUES (" +
            "'" + hash + "', 'text/" + hash + "', 'text_body', 'text/plain', 'none', " +
            sizeBytes + ", " + sizeBytes + ", '" + hash + "', '" + hash + "', " +
            "'missing', 'desktop', '2026-04-27T00:00:00.000Z')");
    }

    private String loadReadableContentStatus() throws Exception {
        return FolioleCompanionReadableArticleQuery.loadReadableArticle(database)
            .getJSONObject("readable_article")
            .getString("content_status");
    }

    private String loadReadableContent() throws Exception {
        return FolioleCompanionReadableArticleQuery.loadReadableArticle(database)
            .getJSONObject("readable_article")
            .getString("content");
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

        private void serve() {
            try (Socket socket = serverSocket.accept();
                 BufferedReader reader = new BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                 OutputStream output = socket.getOutputStream()) {
                reader.readLine();
                output.write(("HTTP/1.1 200 OK\r\nContent-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                output.write(body);
            } catch (Exception ignored) {
            }
        }
    }
}
