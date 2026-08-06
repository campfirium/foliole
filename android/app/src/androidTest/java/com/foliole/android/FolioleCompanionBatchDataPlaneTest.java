package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionBatchDataPlaneTest {
    @Test
    public void stagesContentBytesInPrivateSqlitePackAndCleansIt() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        byte[] bytes = "native body bytes".getBytes(StandardCharsets.UTF_8);
        String hash = FolioleCompanionContentBlobCasRules.digestHex(context, bytes);
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs = Collections.singletonList(
            new FolioleCompanionContentBlobMultipartBatch.Blob(hash, bytes)
        );

        File pack = FolioleCompanionContentBlobPack.create(context, blobs);
        assertTrue(pack.getAbsolutePath().startsWith(context.getCacheDir().getAbsolutePath()));
        assertEquals(hash, FolioleCompanionContentBlobPack.read(pack).get(0).hash);
        FolioleCompanionContentBlobPack.delete(pack);
        assertFalse(pack.exists());
    }

    @Test
    public void rollsBackNewlyStagedAttachmentWhenSharedCommitFails() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        byte[] bytes = "native attachment bytes".getBytes(StandardCharsets.UTF_8);
        File temp = new File(context.getCacheDir(), "attachment-stage-test.bin");
        try (FileOutputStream output = new FileOutputStream(temp)) {
            output.write(bytes);
        }
        String hash = FolioleCompanionAttachmentResourceHash.digestHex(context, temp);
        File target = new File(new File(context.getFilesDir(), "attachments"), hash);
        target.delete();
        Map<String, File> files = new HashMap<>();
        files.put("attachment-1", temp);
        Map<String, String> hashes = new HashMap<>();
        hashes.put("attachment-1", hash);
        String token = FolioleCompanionAttachmentResourceBatchSessions.create(
            files, hashes, Collections.emptyList()
        );

        FolioleCompanionAttachmentFileStage.stage(context, token);
        assertTrue(target.exists());
        FolioleCompanionAttachmentFileStage.finish(token, false);
        assertFalse(target.exists());
        assertFalse(temp.exists());
    }
}
