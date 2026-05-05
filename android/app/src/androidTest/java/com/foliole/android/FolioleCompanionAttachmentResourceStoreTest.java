package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionAttachmentResourceStoreTest {

    private Context context;
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE attachments (" +
            "id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE attachment_blobs (" +
            "attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT, size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "mime_type TEXT, availability TEXT NOT NULL DEFAULT 'remote_known', source_device_id TEXT, " +
            "created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE nodes (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_attachments (node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL)");
    }

    @After
    public void tearDown() {
        database.close();
        deleteAttachmentFile("hash-android-1");
        deleteAttachmentFile("hash-cached");
    }

    @Test
    public void syncsManifestResourceAndResolvesLocalFileUrl() throws Exception {
        FolioleCompanionSyncObjectApply.applyPayload(database, attachmentRecord());
        OneShotHttpServer server = new OneShotHttpServer("image-bytes");
        server.start();

        JSObject synced = FolioleCompanionAttachmentResourceStore.syncResource(
            context,
            database,
            "att-android-1",
            "hash-android-1",
            server.url(),
            new JSONObject()
        );
        JSObject resolved = FolioleCompanionAttachmentResourceStore.resolveResource(context, database, "att-android-1");

        assertEquals("cached", synced.getString("availability"));
        assertEquals("ready", resolved.getString("status"));
        assertEquals("image/png", resolved.getString("mime_type"));
        assertTrue(resolved.getString("resource_url").startsWith("file://"));
        assertEquals("GET", server.method());
    }

    @Test
    public void listsMissingManifestResourcesForMainSync() throws Exception {
        FolioleCompanionSyncObjectApply.applyPayload(database, attachmentRecord());

        JSObject result = FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10);
        JSONObject resource = result.getJSONArray("resources").getJSONObject(0);

        assertEquals(1, result.getJSONArray("resources").length());
        assertEquals("att-android-1", resource.getString("attachment_id"));
        assertEquals("hash-android-1", resource.getString("content_hash"));
        assertEquals(11, resource.getLong("size_bytes"));
    }

    @Test
    public void loadsOneMissingManifestResourceByAttachmentIdForActivePriority() throws Exception {
        insertAttachmentManifest("queued-att", "hash-queued", "2026-04-25T00:00:00.000Z");
        insertAttachmentManifest("active-att", "hash-active", "2026-04-26T00:00:00.000Z");

        JSONObject resource = FolioleCompanionAttachmentResourceStore.loadMissingResource(context, database, "active-att")
            .getJSONObject("resource");

        assertEquals("active-att", resource.getString("attachment_id"));
        assertEquals("hash-active", resource.getString("content_hash"));
        assertEquals(11, resource.getLong("size_bytes"));
    }

    @Test
    public void doesNotLoadCachedManifestResourceForActivePriority() throws Exception {
        insertAttachmentManifest("cached-att", "hash-cached", "2026-04-25T00:00:00.000Z");
        database.execSQL("UPDATE attachment_blobs SET availability = 'cached' WHERE attachment_id = 'cached-att'");
        writeAttachmentFile("hash-cached", "cached-bytes");

        assertTrue(FolioleCompanionAttachmentResourceStore.loadMissingResource(context, database, "cached-att").isNull("resource"));
    }

    @Test
    public void loadsCachedManifestResourceWhenLocalFileIsMissing() throws Exception {
        insertAttachmentManifest("cached-missing-file-att", "hash-missing-file", "2026-04-25T00:00:00.000Z");
        database.execSQL("UPDATE attachment_blobs SET availability = 'cached', storage_key = 'hash-missing-file' " +
            "WHERE attachment_id = 'cached-missing-file-att'");

        JSONObject resource = FolioleCompanionAttachmentResourceStore.loadMissingResource(context, database, "cached-missing-file-att")
            .getJSONObject("resource");

        assertEquals("cached-missing-file-att", resource.getString("attachment_id"));
        assertEquals("hash-missing-file", resource.getString("content_hash"));
    }

    @Test
    public void ordersMissingManifestResourcesByActiveThenRecentTopicLinks() throws Exception {
        insertAttachmentManifest("old-att", "hash-old", "2026-04-25T00:00:00.000Z");
        insertAttachmentManifest("active-att", "hash-active", "2026-04-25T00:00:00.000Z");
        insertAttachmentManifest("recent-att", "hash-recent", "2026-04-25T00:00:00.000Z");
        insertAttachmentManifest("unlinked-att", "hash-unlinked", "2026-04-24T00:00:00.000Z");
        insertNode("old-node", "2026-04-26T00:00:00.000Z");
        insertNode("active-node", "2026-04-25T00:00:00.000Z");
        insertNode("recent-node", "2026-04-27T00:00:00.000Z");
        insertNodeAttachment("old-node", "old-att");
        insertNodeAttachment("active-node", "active-att");
        insertNodeAttachment("recent-node", "recent-att");
        database.execSQL("INSERT INTO workspace_meta (key, value, updated_at) VALUES " +
            "('active_node_id', 'active-node', '2026-04-28T00:00:00.000Z')");

        assertEquals("active-att", FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10)
            .getJSONArray("resources")
            .getJSONObject(0)
            .getString("attachment_id"));
        assertEquals("recent-att", FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10)
            .getJSONArray("resources")
            .getJSONObject(1)
            .getString("attachment_id"));
        assertEquals("old-att", FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10)
            .getJSONArray("resources")
            .getJSONObject(2)
            .getString("attachment_id"));
        assertEquals("unlinked-att", FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10)
            .getJSONArray("resources")
            .getJSONObject(3)
            .getString("attachment_id"));
    }

    @Test
    public void ordersDueReviewResourcesBeforeOrdinaryRecentTopicLinks() throws Exception {
        insertAttachmentManifest("due-review-att", "hash-due-review", "2026-04-25T00:00:00.000Z");
        insertAttachmentManifest("recent-att", "hash-recent", "2026-04-25T00:00:00.000Z");
        insertAttachmentManifest("old-att", "hash-old", "2026-04-25T00:00:00.000Z");
        insertNode("due-review-node", "2026-04-26T00:00:00.000Z");
        insertNode("recent-node", "2026-04-30T00:00:00.000Z");
        insertNode("old-node", "2026-04-25T00:00:00.000Z");
        insertNodeAttachment("due-review-node", "due-review-att");
        insertNodeAttachment("recent-node", "recent-att");
        insertNodeAttachment("old-node", "old-att");
        insertReviewDue("due-review-node", "2026-04-20T00:00:00.000Z");

        assertEquals("due-review-att", FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10)
            .getJSONArray("resources")
            .getJSONObject(0)
            .getString("attachment_id"));
        assertEquals("recent-att", FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10)
            .getJSONArray("resources")
            .getJSONObject(1)
            .getString("attachment_id"));
        assertEquals("old-att", FolioleCompanionAttachmentResourceStore.loadMissingResources(database, 10)
            .getJSONArray("resources")
            .getJSONObject(2)
            .getString("attachment_id"));
    }

    private JSONObject attachmentRecord() throws Exception {
        JSONObject blob = new JSONObject()
            .put("content_hash", "hash-android-1")
            .put("storage_key", "hash-android-1")
            .put("size_bytes", 11)
            .put("mime_type", "image/png")
            .put("availability", "remote_known")
            .put("created_at", "2026-04-25T00:00:00.000Z");
        JSONObject payload = new JSONObject()
            .put("original_name", "image.png")
            .put("mime_type", "image/png")
            .put("size_bytes", 11)
            .put("created_at", "2026-04-25T00:00:00.000Z")
            .put("blob", blob);
        return new JSONObject()
            .put("object_type", "attachment")
            .put("object_id", "att-android-1")
            .put("content_hash", "state-hash")
            .put("deleted_at", JSONObject.NULL)
            .put("payload_json", payload.toString())
            .put("updated_at", "2026-04-25T00:00:00.000Z");
    }

    private void insertAttachmentManifest(String attachmentId, String contentHash, String createdAt) {
        database.execSQL("INSERT INTO attachment_blobs (" +
            "attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, source_device_id, created_at" +
            ") VALUES ('" + attachmentId + "', '" + contentHash + "', '" + contentHash + "', 11, " +
            "'image/png', 'remote_known', 'desktop', '" + createdAt + "')");
    }

    private void insertNode(String nodeId, String updatedAt) {
        database.execSQL("INSERT INTO nodes (id, updated_at, deleted_at) VALUES ('" + nodeId + "', '" + updatedAt + "', NULL)");
    }

    private void insertNodeAttachment(String nodeId, String attachmentId) {
        database.execSQL("INSERT INTO node_attachments (node_id, attachment_id, role) VALUES " +
            "('" + nodeId + "', '" + attachmentId + "', 'inline')");
    }

    private void insertReviewDue(String nodeId, String due) {
        database.execSQL("INSERT INTO node_review (node_id, due) VALUES ('" + nodeId + "', '" + due + "')");
    }

    private void deleteAttachmentFile(String storageKey) {
        File file = new File(new File(context.getFilesDir(), "attachments"), storageKey);
        if (file.exists()) {
            file.delete();
        }
    }

    private void writeAttachmentFile(String storageKey, String content) throws Exception {
        File directory = new File(context.getFilesDir(), "attachments");
        assertTrue(directory.exists() || directory.mkdirs());
        try (OutputStream output = new java.io.FileOutputStream(new File(directory, storageKey))) {
            output.write(content.getBytes(StandardCharsets.UTF_8));
        }
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
            return "http://127.0.0.1:" + serverSocket.getLocalPort() + "/attachment";
        }

        String method() throws Exception {
            thread.join(5000);
            return method;
        }

        private void serve() {
            try (Socket socket = serverSocket.accept();
                 BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                 OutputStream output = socket.getOutputStream()) {
                method = reader.readLine().split(" ")[0];
                output.write(("HTTP/1.1 200 OK\r\nContent-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                output.write(body);
            } catch (Exception ignored) {
            }
        }
    }
}
