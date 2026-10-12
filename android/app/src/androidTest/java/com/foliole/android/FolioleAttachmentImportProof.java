package com.foliole.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.nio.file.Files;

final class FolioleAttachmentImportProof {
    static void verify(Context target) throws Exception {
        File root = Files.createTempDirectory(target.getCacheDir().toPath(), "attachment-import-").toFile();
        Context context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return root; }
        };
        FramedSyncPayloadBudget owner = new FramedSyncPayloadBudget(root.getPath(), "presence");
        try { verifyFiles(context, owner); }
        finally {
            owner.cancel();
            try (var entries = Files.walk(root.toPath())) {
                for (var entry : entries.sorted(java.util.Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new)) {
                    Files.delete(entry);
                }
            }
        }
    }

    private static void verifyFiles(Context context, FramedSyncPayloadBudget owner) throws Exception {
        String encoded = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=";
        byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
        String hash = FolioleCompanionResourceAvailability.digest(bytes), key = hash + ".png";
        PluginCall input = call(new JSObject().put("bytesBase64", encoded).put("contentHash", hash)
            .put("mimeType", "image/png").put("storageKey", key));
        assertEquals("created", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        assertEquals("reused", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        assertArrayEquals(bytes, Files.readAllBytes(new File(context.getFilesDir(), "attachments/" + key).toPath()));
        for (boolean trash : new boolean[] {false, true}) {
            if (trash) FolioleAttachmentMaintenanceFiles.move(context, key, true);
            JSObject info = FolioleAttachmentBlockFiles.access(context, owner,
                call(new JSObject().put("action", "source-stat").put("key", key)));
            assertTrue(info.getBool("present"));
            assertEquals(bytes.length, info.getInteger("length").intValue());
            assertEquals("", info.getString("hash"));
        }
    }

    private static PluginCall call(JSObject data) {
        return new PluginCall(null, "FolioleCompanionSync", "attachment-import", "accessFramedSyncFile", data);
    }
}
