package com.foliole.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleArticleImageCasesProjectionTest {
    @Test public void projectsProductCreatedArticles() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.foliole.android", context.getPackageName());
        Bundle args = InstrumentationRegistry.getArguments();
        String mode = args.getString("caseMode", "inspect");
        if (!mode.equals("inspect")) assertEquals("true", args.getString("disposableTestData"));
        JSONObject result = new JSONObject().put("mode", mode);
        if (mode.equals("online")) result.put("network", FolioleArticleImageTestNetwork.restore(context));
        JSONArray rows = readArticles(context);
        if (mode.equals("remove-changed") || mode.equals("offline")) {
            String title = mode.equals("offline") ? "S203 HTTPS image" : "S203 changed";
            result.put("removedKey", removeImage(context, rows, title));
        }
        if (mode.equals("offline")) result.put("network", FolioleArticleImageTestNetwork.disconnect(context));
        result.put("articles", readArticles(context));
        String pid = args.getString("observedPid", "");
        if (!pid.isEmpty()) result.put("imageTraffic", FolioleArticleImageTestNetwork.imageTraffic(pid));
        Bundle receipt = new Bundle();
        receipt.putString("stream", "S203_CASES_PROJECTION=" + result + "\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(0, receipt);
    }

    private JSONArray readArticles(Context context) throws Exception {
        JSONArray rows = new JSONArray();
        String sql = "SELECT n.id, n.title, CASE WHEN n.body_blob_hash IS NULL THEN n.content ELSE CAST(c.data AS TEXT) END, "
            + "COALESCE(n.image_sources, '{}') FROM nodes n LEFT JOIN content_blob_data c ON c.hash = n.body_blob_hash "
            + "WHERE n.title IN ('S203 HTTPS image', 'S203 changed', 'S203 sibling', 'S203 local') AND n.deleted_at IS NULL ORDER BY n.title";
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath("foliole-companionSQLite.db").getPath(),
                 null, SQLiteDatabase.OPEN_READONLY); Cursor row = db.rawQuery(sql, null)) {
            while (row.moveToNext()) {
                JSONObject sources = new JSONObject(row.getString(3));
                JSONObject files = new JSONObject();
                var keys = sources.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    File file = imageFile(context, key);
                    files.put(key, new JSONObject().put("exists", file.isFile()).put("bytes", file.isFile() ? file.length() : 0)
                        .put("hash", file.isFile() ? FolioleCompanionAttachmentResourceHash.digestHex(context, file) : JSONObject.NULL));
                }
                if (row.getString(1).equals("S203 local")) {
                    String key = "e".repeat(64) + ".png";
                    assertEquals(0, sources.length());
                    assertTrue(row.getString(2).contains("asset://" + key));
                    assertFalse(imageFile(context, key).exists());
                    files.put(key, new JSONObject().put("exists", false));
                }
                rows.put(new JSONObject().put("id", row.getString(0)).put("title", row.getString(1))
                    .put("content", row.getString(2)).put("imageSources", sources).put("files", files));
            }
        }
        assertEquals("Create all four fixtures through Capture", 4, rows.length());
        return rows;
    }

    private String removeImage(Context context, JSONArray rows, String title) throws Exception {
        for (int index = 0; index < rows.length(); index++) {
            JSONObject row = rows.getJSONObject(index);
            if (!title.equals(row.getString("title"))) continue;
            JSONObject sources = row.getJSONObject("imageSources");
            assertEquals(1, sources.length());
            String key = sources.keys().next();
            assertTrue(row.getString("content").contains("asset://" + key));
            String source = sources.getString(key);
            assertEquals(title.equals("S203 changed") ? "https://picsum.photos/173/127.jpg?random=s203-20260920"
                : "https://httpbingo.org/image/png", source);
            File file = imageFile(context, key);
            assertTrue(file.isFile());
            assertTrue(key.startsWith(FolioleCompanionAttachmentResourceHash.digestHex(context, file) + "."));
            Files.delete(file.toPath());
            assertFalse(file.exists());
            return key;
        }
        throw new AssertionError("Fixture missing: " + title);
    }

    private File imageFile(Context context, String key) throws Exception {
        assertTrue(key.matches("[a-f0-9]{64}\\.(png|jpg|webp)"));
        File file = new File(context.getFilesDir(), "attachments/" + key);
        assertFalse(Files.isSymbolicLink(file.toPath()));
        return file;
    }
}
