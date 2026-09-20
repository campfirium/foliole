package com.foliole.android;

import static org.junit.Assert.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

@RunWith(AndroidJUnit4.class)
public final class FolioleResourceProviderTest {
    private FolioleResourceProviderFixture fixture;
    @Before public void prepare() throws Exception {
        fixture = new FolioleResourceProviderFixture(InstrumentationRegistry.getInstrumentation().getTargetContext());
    }
    @After public void cleanup() throws Exception { if (fixture != null) fixture.close(); }

    @Test public void availabilityRequiresVerifiedBytesAndRevokesDeletedFiles() throws Exception {
        byte[] good = bytes("good"); String id = hash(good);
        fixture.blob(id, good, good);
        fixture.blob(hash(bytes("bad")), bytes("bad"), bytes("damage"));
        fixture.blob(hash(bytes("lost")), bytes("lost"), null);
        JSONArray needs = new JSONArray();
        for (String text : new String[] {"good", "bad", "lost"}) needs.put(need("content_blob", hash(bytes(text))));
        JSONArray claims = reply(needs).getJSONArray("resources");
        assertEquals("available", claims.getJSONObject(0).getString("status"));
        assertEquals("checksum_mismatch", claims.getJSONObject(1).getString("status"));
        assertEquals("missing", claims.getJSONObject(2).getString("status"));
        try (var db = android.database.sqlite.SQLiteDatabase.openDatabase(fixture.database.getPath(), null, 0)) {
            db.execSQL("INSERT INTO attachments VALUES (?, 'image/png')", new Object[] {id});
        }
        var directory = new java.io.File(fixture.root, "attachments"); assertTrue(directory.mkdir());
        var file = new java.io.File(directory, id + ".png"); Files.write(file.toPath(), good);
        JSONArray attachment = new JSONArray().put(need("attachment", id));
        assertEquals("available", reply(attachment).getJSONArray("resources").getJSONObject(0).getString("status"));
        Files.delete(file.toPath());
        assertEquals("missing", reply(attachment).getJSONArray("resources").getJSONObject(0).getString("status"));
    }

    @Test public void rejectsOversizedDuplicateAndInvalidDemands() throws Exception {
        JSONObject need = need("attachment", "a".repeat(64));
        assertThrows(Exception.class, () -> reply(new JSONArray().put(need).put(need)));
        assertThrows(Exception.class, () -> reply(new JSONArray().put(need("attachment", "../unsafe"))));
        JSONArray tooMany = new JSONArray(); for (int i = 0; i < 33; i++) tooMany.put(need);
        assertThrows(Exception.class, () -> reply(tooMany));
    }

    @Test public void mixedAttachmentDownloadsKeepSuccessAndAuthenticateFailures() throws Exception {
        fixture.installCredentials();
        String endpoint = fixture.start(request -> {
            String route = request.path;
            int status = route.equals("/gone") || route.equals("/forged") ? 404 : 200;
            byte[] body = route.equals("/good") ? bytes("good") : bytes("wrong");
            return new FolioleResourceProviderFixture.Reply(status, "application/octet-stream", body, !route.equals("/forged"));
        });
        JSONArray resources = new JSONArray();
        for (String text : new String[] {"good", "gone", "bad", "forged"}) {
            String id = hash(bytes(text));
            resources.put(new JSONObject().put("attachment_id", id).put("content_hash", id).put("mime_type", "image/png")
                .put("storage_key", id + ".png").put("url", endpoint + "/" + text).put("headers", fixture.headers()));
        }
        JSONObject result = FolioleCompanionAttachmentResourceBatchStore.downloadResources(fixture.context, resources);
        String token = result.getString("batch_token");
        try {
            assertEquals(hash(bytes("good")), result.getJSONArray("synced_attachment_ids").getString(0));
            JSONObject errors = result.getJSONObject("failed_attachment_errors");
            assertEquals("missing_file", errors.getString(hash(bytes("gone"))));
            assertEquals("checksum_mismatch", errors.getString(hash(bytes("bad"))));
            assertEquals("authentication_failed", errors.getString(hash(bytes("forged"))));
            assertEquals(1, FolioleCompanionAttachmentResourceBatchSessions.get(token).tempFilesById.size());
        } finally { FolioleCompanionAttachmentResourceBatchSessions.finish(token, false); }
    }

    @Test public void mixedContentBatchStagesOnlyVerifiedRequestedBodies() throws Exception {
        fixture.installCredentials();
        String good = hash(bytes("good")), bad = hash(bytes("bad")), missing = hash(bytes("missing"));
        byte[] multipart = bytes(part(good, "good") + part(bad, "wrong") + "--fixture--\r\n");
        String endpoint = fixture.start(request -> new FolioleResourceProviderFixture.Reply(
            200, "multipart/mixed; boundary=fixture", multipart, true));
        JSONObject result = FolioleCompanionContentBlobBatchStore.downloadBlobs(fixture.context,
            endpoint + "/companion/content-blobs", fixture.headers(), new JSONObject()
                .put("hashes", new JSONArray().put(good).put(bad).put(missing)).toString());
        String token = result.getString("batch_token");
        try {
            assertEquals(good, result.getJSONArray("synced_hashes").getString(0));
            assertEquals("checksum_mismatch", result.getJSONObject("failed_hash_errors").getString(bad));
            assertEquals("missing_file", result.getJSONObject("failed_hash_errors").getString(missing));
            var rows = FolioleCompanionContentBlobPack.read(FolioleCompanionContentBlobBatchSessions.get(token).pack);
            assertEquals(1, rows.size()); assertArrayEquals(bytes("good"), rows.get(0).bytes);
        } finally { FolioleCompanionContentBlobBatchSessions.finish(token); }
    }
    private JSONObject reply(JSONArray needs) throws Exception {
        return FolioleCompanionResourceAvailability.reply(fixture.context, fixture.database.getPath(),
            new JSONObject().put("resources", needs).toString(), "provider");
    }
    private JSONObject need(String kind, String id) throws Exception { return new JSONObject().put("kind", kind).put("id", id); }
    private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    private static String hash(byte[] value) throws Exception { return FolioleCompanionResourceAvailability.digest(value); }
    private static String part(String hash, String body) {
        return "--fixture\r\nContent-Type: text/plain\r\nContent-Length: " + body.length() + "\r\nX-Blob-Hash: " + hash + "\r\n\r\n" + body + "\r\n";
    }
}
