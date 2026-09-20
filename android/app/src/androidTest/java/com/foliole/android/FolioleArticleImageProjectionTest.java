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
import java.security.MessageDigest;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Native fixture preparation and read-only projection; UI recovery is exercised separately. */
@RunWith(AndroidJUnit4.class)
public class FolioleArticleImageProjectionTest {
    private static final String KEY = "541a1ef5373be3dc49fc542fd9a65177b664aec01c8d8608f99e6ec95577d8c1.png";
    private static final String SOURCE = "https://httpbingo.org/image/png";

    @Test public void projectsPublicImageAndOptionallyRemovesItsFile() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.foliole.android", context.getPackageName());
        Bundle arguments = InstrumentationRegistry.getArguments();
        boolean remove = "true".equals(arguments.getString("removePublicImage"));
        if (remove) assertEquals("true", arguments.getString("disposableTestData"));
        JSONObject article = readArticle(context);
        File file = new File(context.getFilesDir(), "attachments/" + KEY);
        assertFalse(Files.isSymbolicLink(file.toPath()));
        assertTrue(file.isFile());
        byte[] bytes = Files.readAllBytes(file.toPath());
        StringBuilder hash = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hash.append(String.format("%02x", value));
        assertEquals(KEY, hash + ".png");
        if (remove) Files.delete(file.toPath());
        assertEquals(!remove, file.exists());
        article.put("storageKey", KEY).put("removed", remove).put("fileExists", file.exists());
        Bundle result = new Bundle();
        result.putString("stream", "S203_IMAGE_PROJECTION=" + article + "\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(0, result);
    }

    private JSONObject readArticle(Context context) throws Exception {
        String sql = "SELECT n.id, CASE WHEN n.body_blob_hash IS NULL THEN n.content ELSE CAST(c.data AS TEXT) END, "
            + "COALESCE(n.image_sources, '{}') FROM nodes n LEFT JOIN content_blob_data c ON c.hash = n.body_blob_hash "
            + "WHERE n.title = ? AND n.deleted_at IS NULL";
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath("foliole-companionSQLite.db").getPath(),
                 null, SQLiteDatabase.OPEN_READONLY);
             Cursor row = db.rawQuery(sql, new String[] {"S203 HTTPS image"})) {
            assertTrue("Create the article through Capture before running this projection", row.moveToFirst());
            String id = row.getString(0);
            String body = row.getString(1);
            JSONObject sources = new JSONObject(row.getString(2));
            assertEquals("# S203 HTTPS image\n\n![S203 public PNG](asset://" + KEY + ")", body);
            assertEquals(SOURCE, sources.getString(KEY));
            assertFalse("The fixture title must identify exactly one article", row.moveToNext());
            return new JSONObject().put("nodeId", id).put("content", body).put("imageSources", sources);
        }
    }
}
