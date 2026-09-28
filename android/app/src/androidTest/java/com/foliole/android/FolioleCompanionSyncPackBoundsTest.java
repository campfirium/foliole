package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.RandomAccessFile;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncPackBoundsTest {
    @Test
    public void rejectsAnOversizedPageBeforeReadingItsArchive() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File archive = File.createTempFile("oversized-pack-", ".syncpack", context.getCacheDir());
        File database = File.createTempFile("oversized-pack-", ".db", context.getCacheDir());
        try {
            try (RandomAccessFile output = new RandomAccessFile(archive, "rw")) {
                output.setLength(FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES + 1L);
            }
            IllegalArgumentException failure = assertThrows(IllegalArgumentException.class, () ->
                FolioleCompanionSyncPackFileValidator.validate(archive, database,
                    FolioleCompanionSyncPackContract.load(context), "target", "source"));
            assertEquals("sync_pack_transfer_limit_exceeded", failure.getMessage());
        } finally {
            archive.delete();
            database.delete();
        }
    }
}
