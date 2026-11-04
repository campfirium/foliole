package com.foliole.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.Bundle;
import android.system.Os;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;

/** Initial aged-file and ordinary directory-permission fixtures; never writes SQLite. */
@RunWith(AndroidJUnit4.class)
public class FolioleFolderBackupCleanupFixture {
    private static final String PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    private static final String RETAINED_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/bo8wWQAAAABJRU5ErkJggg==";

    @Test public void preparesOnlyTheRequestedAcceptanceFixture() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("com.campfirium.foliole.android.acceptance", context.getPackageName());
        String phase = InstrumentationRegistry.getArguments().getString("cleanupPhase", "");
        String key = key(PNG), retainedKey = key(RETAINED_PNG);
        File trash = FolioleAttachmentMaintenanceFiles.directory(context, true);
        switch (phase) {
            case "prepare":
                createInitial(context, PNG);
                createInitial(context, RETAINED_PNG);
                break;
            case "age":
                ageInitial(context, key, retainedKey);
                break;
            case "block":
                assertTrue(new File(trash, key).isFile());
                Os.chmod(trash.getPath(), 0500);
                assertFalse(trash.canWrite());
                break;
            case "restore":
                Os.chmod(trash.getPath(), 0700);
                assertTrue(trash.canWrite());
                break;
            default: fail("Unknown acceptance fixture phase");
        }
        Bundle receipt = new Bundle();
        receipt.putString("folioleCleanupFixture", new JSONObject().put("phase", phase)
            .put("unreferencedKey", key).put("retainedKey", retainedKey).toString());
        instrumentation.sendStatus(2, receipt);
    }

    private static void createInitial(Context context, String encoded) throws Exception {
        File file = new File(FolioleAttachmentMaintenanceFiles.directory(context, false), key(encoded));
        assertFalse("The initial fixture must be new", file.exists());
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(Base64.decode(encoded, Base64.DEFAULT)); output.getFD().sync();
        }
    }

    private static void ageInitial(Context context, String key, String retainedKey) throws Exception {
        File state = new File(context.getFilesDir(), "attachment-observations.json");
        JSONObject observation = new JSONObject(new String(Files.readAllBytes(state.toPath()), StandardCharsets.UTF_8));
        assertFalse(observation.getString("databaseGeneration").isEmpty());
        observation.getJSONObject("counts").put(key, 1).put(retainedKey, 1);
        File temporary = new File(context.getFilesDir(), "attachment-observations.partial");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(observation.toString().getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
        }
        Os.rename(temporary.getPath(), state.getPath());
    }

    private static String key(String encoded) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(Base64.decode(encoded, Base64.DEFAULT));
        StringBuilder result = new StringBuilder();
        for (byte value : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return result + ".png";
    }
}
