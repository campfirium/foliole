package com.foliole.android;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONObject;
import java.io.File;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class FolioleResourceProviderFixture implements AutoCloseable {
    static final String KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
    final File root;
    final File database;
    final Context context;
    final String preferences = "t203-" + UUID.randomUUID();
    final Context target;
    private ServerSocket server;
    private ExecutorService workers;
    interface Responder { Reply respond(FolioleCompanionHttpRequest request) throws Exception; }
    static final class Reply {
        final int status;
        final String type;
        final byte[] body;
        final boolean encrypted;
        final long totalBytes;
        Reply(int status, String type, byte[] body, boolean encrypted) {
            this(status, type, body, encrypted, -1);
        }
        Reply(int status, String type, byte[] body, boolean encrypted, long totalBytes) {
            this.status = status; this.type = type; this.body = body; this.encrypted = encrypted;
            this.totalBytes = totalBytes;
        }
    }
    FolioleResourceProviderFixture(Context target) throws Exception {
        this.target = target;
        root = Files.createTempDirectory(target.getCacheDir().toPath(), "t203-provider-").toFile();
        database = new File(root, "fixture.db");
        context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return root; }
            @Override public File getCacheDir() { return root; }
            @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                return target.getSharedPreferences(preferences, mode);
            }
        };
        try (SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(database, null)) {
            db.execSQL("CREATE TABLE attachment_receive_checkpoints (content_hash TEXT, temporary_path TEXT, total_bytes INTEGER, confirmed_bytes INTEGER, PRIMARY KEY(content_hash,temporary_path))");
            db.execSQL("CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, mime_type TEXT, stored_sha256 TEXT, stored_size_bytes INTEGER)");
            db.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB)");
        }
    }
    void installCredentials() {
        FolioleCompanionSyncGroupDataBridge.install(context, this, event -> {
            if (event.getString("operation").equals("attachment_checkpoint")) {
                FolioleCompanionSyncGroupDataBridge.current().resolve(new JSONObject()
                    .put("request_id", event.getString("request_id")).put("result", checkpoint(event.getJSONObject("payload"))));
                return;
            }
            if (!event.getString("operation").equals("load_current_credential")) throw new IllegalStateException("unexpected operation");
            FolioleCompanionSyncGroupDataBridge.current().resolve(new JSONObject()
                .put("request_id", event.getString("request_id"))
                .put("result", new JSONObject().put("device_id", "fixture").put("workgroup_key", KEY)));
        });
    }
    JSONObject headers() throws Exception {
        return new JSONObject().put("X-Sync-Group-Id", "fixture-group").put("X-Device-Id", "fixture");
    }
    private JSONObject checkpoint(JSONObject payload) throws Exception {
        if (!database.getAbsolutePath().equals(payload.getString("database_path"))) throw new IllegalArgumentException("wrong database");
        String action = payload.getString("action");
        String[] identity = { payload.getString("content_hash"), payload.getString("temporary_path") };
        String key = action.equals("load") ? "checkpointLoad" : action.equals("save") ? "checkpointSave" : "checkpointClear";
        String sql = FolioleCompanionBridgeContractDefinitions.hostApiString(context, "attachmentResourceSync", "sql", key);
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(database.getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
            if (action.equals("load")) {
                try (android.database.Cursor row = db.rawQuery(sql, identity)) {
                    long confirmed = row.moveToFirst() && row.getLong(0) == payload.getLong("total_bytes") ? row.getLong(1) : 0;
                    return new JSONObject().put("confirmed_bytes", confirmed);
                }
            }
            if (action.equals("save")) db.execSQL(sql, new Object[] { identity[0], identity[1], payload.getLong("total_bytes"), payload.getLong("confirmed_bytes") });
            else db.execSQL(sql, identity);
            return new JSONObject();
        }
    }

    String start(Responder responder) throws Exception {
        server = new ServerSocket(0, 8, java.net.InetAddress.getByName("127.0.0.1"));
        workers = Executors.newFixedThreadPool(5);
        workers.submit(() -> {
            while (!server.isClosed()) {
                try { Socket socket = server.accept(); workers.submit(() -> respond(socket, responder)); }
                catch (Exception error) { if (!server.isClosed()) throw new RuntimeException(error); }
            }
        });
        return "http://127.0.0.1:" + server.getLocalPort();
    }
    private void respond(Socket socket, Responder responder) {
        try (Socket owned = socket) {
            FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(owned.getInputStream());
            Reply reply = responder.respond(request);
            byte[] body = reply.encrypted ? FolioleCompanionSyncGroupCrypto.encrypt(KEY,
                FolioleCompanionSyncGroupCrypto.groupTag(KEY), request.method, request.path, "response", reply.type, reply.body)
                .toString().getBytes(StandardCharsets.UTF_8) : reply.body;
            FolioleCompanionHttpResponse.bytes(owned.getOutputStream(), reply.status,
                reply.encrypted ? FolioleCompanionWorkgroupHttp.ENVELOPE_CONTENT_TYPE : reply.type,
                reply.type, body, reply.totalBytes);
        } catch (Exception error) { throw new RuntimeException(error); }
    }
    void blob(String hash, byte[] expected, byte[] actual) throws Exception {
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(database.getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
            db.execSQL("INSERT INTO content_blobs VALUES (?, 'text/plain', ?, ?)",
                new Object[] { hash, FolioleCompanionResourceAvailability.digest(expected), expected.length });
            if (actual != null) db.execSQL("INSERT INTO content_blob_data VALUES (?, ?)", new Object[] { hash, actual });
        }
    }
    @Override public void close() throws Exception {
        if (server != null) server.close();
        if (workers != null) { workers.shutdownNow(); workers.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS); }
        FolioleCompanionSyncGroupDataBridge.uninstall(this);
        target.deleteSharedPreferences(preferences);
        try (var entries = Files.walk(root.toPath())) {
            for (var entry : entries.sorted(java.util.Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new)) Files.delete(entry);
        }
    }
}
