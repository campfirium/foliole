package com.foliole.android.framed;

import static com.foliole.android.framed.FramedSyncSQLiteFixture.BLOB;
import static com.foliole.android.framed.FramedSyncSQLiteFixture.BLOB_HASH;
import static com.foliole.android.framed.FramedSyncSQLiteFixture.fact;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncFileStorageTest {
    private static final byte[] KEY = new byte[32];
    private static final FramedSyncTransferContext CONTEXT = new FramedSyncTransferContext(
        "group-a", "device-a", "epoch-a", "device-b", "epoch-b");

    @Test public void interruptedFilesReopenAndRetainedRetryPreservesReadyBody() throws Exception {
        Context host = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String library = "file-test-" + UUID.randomUUID();
        var files = new FramedSyncFiles(host, library);
        File resources = new File(host.getCacheDir(), library);
        try {
            byte[] first = wire();
            try {
                receive(files, resources, Arrays.copyOf(first, first.length - 1));
                fail("truncated stream must fail");
            } catch (FramedSyncStreamReader.TransportInterruption expected) {
                assertEquals("framed_sync_frame_body_truncated", expected.getMessage());
            }
            var preamble = new FramedSyncStreamReader(new ByteArrayInputStream(first)).readPreamble();
            var reopened = new FramedSyncFiles(host, library);
            receive(reopened, resources, first);
            String key = FramedSyncFileRecords.directory(preamble.contextId()) + "/transfer.json";
            byte[] ready = reopened.read(key);
            assertEquals("ready_to_apply", FramedSyncFileRecords.read(reopened, key).getString("state"));
            String attempt = FramedSyncFileRecords.attempt(preamble.contextId(), preamble.identifier());
            assertArrayEquals(BLOB, reopened.read(attempt + "/bodies/" + FramedSyncResourceFiles.hex(BLOB_HASH) + ".body"));
            byte[] retry = wire();
            receive(reopened, resources, retry);
            assertArrayEquals(ready, reopened.read(key));
            var retryPreamble = new FramedSyncStreamReader(new ByteArrayInputStream(retry)).readPreamble();
            assertEquals(0, reopened.list(FramedSyncFileRecords.attempt(retryPreamble.contextId(), retryPreamble.identifier())).length);
            verifyHeaderWithoutFrameCanBeDiscarded(reopened, preamble, key);
        } finally {
            files.remove("inbound");
            resources.delete();
        }
    }

    private static void verifyHeaderWithoutFrameCanBeDiscarded(FramedSyncFiles files,
        FramedSyncPreamble preamble, String key) throws Exception {
        var record = FramedSyncFileRecords.read(files, key);
        record.put("state", "receiving");
        record.remove("verifiedManifest");
        FramedSyncFileRecords.write(files, key, record);
        files.remove(FramedSyncFileRecords.attempt(preamble.contextId(), preamble.identifier()));
        new FramedSyncFileStaging(files, null, CONTEXT).invalidateInboundAttempt(preamble.contextId(), preamble.identifier());
        assertEquals("proposed", FramedSyncFileRecords.read(files, key).getString("state"));
    }

    private static void receive(FramedSyncFiles files, File resources, byte[] wire) throws Exception {
        var staging = new FramedSyncFileStaging(files, resources, CONTEXT);
        try { FramedSyncTransferReader.receive(new ByteArrayInputStream(wire), KEY, CONTEXT, staging); }
        finally { staging.releaseRetainedRetry(); }
    }

    private static byte[] wire() throws Exception {
        MemoryOutbound staging = new MemoryOutbound();
        var attempt = FramedSyncTransferWriter.prepare(KEY, CONTEXT, Collections.singletonList(fact("original").getFact()),
            Collections.singletonList(new FramedSyncBlobContent(BLOB_HASH, BLOB)), staging);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncTransferWriter.replay(attempt, staging, output);
        return output.toByteArray();
    }

    private static final class MemoryOutbound implements FramedSyncOutboundStaging {
        private final List<FramedSyncAuthenticatedFrame> frames = new ArrayList<>();
        @Override public FramedSyncStageOutcome prepareOutboundAttempt(
            byte[] transferId, byte[] attemptId, byte[] preamble) { return FramedSyncStageOutcome.CREATED; }
        @Override public FramedSyncStageOutcome commitOutboundFrame(FramedSyncAuthenticatedFrame frame) {
            frames.add(frame); return FramedSyncStageOutcome.CREATED;
        }
        @Override public FramedSyncStageOutcome finalizeOutboundAttempt(
            byte[] transferId, byte[] attemptId) { return FramedSyncStageOutcome.CREATED; }
        @Override public void replayOutboundFrames(
            byte[] transferId, byte[] attemptId, FramedSyncStreamWriter writer
        ) throws Exception {
            for (FramedSyncAuthenticatedFrame frame : frames) {
                writer.writeFrame(frame.frameHeader(), frame.ciphertext());
            }
        }
    }

}
