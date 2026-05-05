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
    }

    @After
    public void tearDown() {
        database.close();
        deleteAttachmentFile("hash-android-1");
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

    private void deleteAttachmentFile(String storageKey) {
        File file = new File(new File(context.getFilesDir(), "attachments"), storageKey);
        if (file.exists()) {
            file.delete();
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
