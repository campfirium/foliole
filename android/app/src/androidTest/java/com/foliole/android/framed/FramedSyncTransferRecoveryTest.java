package com.foliole.android.framed;

import static com.foliole.android.framed.FramedSyncSQLiteFixture.BLOB;
import static com.foliole.android.framed.FramedSyncSQLiteFixture.BLOB_HASH;
import static com.foliole.android.framed.FramedSyncSQLiteFixture.fact;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncTransferRecoveryTest {
    private static final byte[] GROUP_KEY = new byte[32];
    private static final FramedSyncTransferContext CONTEXT = new FramedSyncTransferContext(
        "group-a", "device-a", "epoch-a", "device-b", "epoch-b");

    @Test public void reopensAndExactlyReplaysAfterTransportTruncation() throws Exception {
        byte[] wire = wire();
        File file = File.createTempFile("framed-sync-inbound-replay", ".db");
        try {
            try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                FramedSyncSQLiteStaging staging = new FramedSyncSQLiteStaging(database);
                reject(() -> FramedSyncTransferReader.receive(
                    new ByteArrayInputStream(Arrays.copyOf(wire, wire.length - 1)),
                    GROUP_KEY, CONTEXT, staging), "framed_sync_frame_body_truncated");
                assertEquals("receiving", scalar(database,
                    "SELECT state FROM framed_sync_android_transfers"));
                assertEquals(3, count(database, "framed_sync_android_frames"));
            }
            try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
                file.getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
                FramedSyncTransferReader.receive(
                    new ByteArrayInputStream(wire), GROUP_KEY, CONTEXT,
                    new FramedSyncSQLiteStaging(database));
                assertEquals("ready_to_apply", scalar(database,
                    "SELECT state FROM framed_sync_android_transfers"));
                assertEquals(4, count(database, "framed_sync_android_frames"));
            }
        } finally {
            file.delete();
        }
    }

    @Test public void invalidatesAuthenticatedAttemptAfterAuthOrProtocolFailure() throws Exception {
        byte[] wire = wire();
        byte[] badAuth = wire.clone();
        int secondCiphertext = secondCiphertextOffset(wire);
        badAuth[secondCiphertext] ^= 1;
        assertInvalidated(badAuth, "frame_authentication_failed");
        assertInvalidated(repeatedHeaderWire(wire), "transfer_header_repeated");
    }

    private static void assertInvalidated(byte[] wire, String error) throws Exception {
        File file = File.createTempFile("framed-sync-inbound-invalid", ".db");
        try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
            FramedSyncSQLiteStaging staging = new FramedSyncSQLiteStaging(database);
            reject(() -> FramedSyncTransferReader.receive(
                new ByteArrayInputStream(wire), GROUP_KEY, CONTEXT, staging), error);
            assertEquals("proposed", scalar(database,
                "SELECT state FROM framed_sync_android_transfers"));
            assertEquals("invalidated", scalar(database,
                "SELECT state FROM framed_sync_android_attempts"));
            assertEquals(0, count(database, "framed_sync_android_frames"));
        } finally {
            file.delete();
        }
    }

    private static byte[] repeatedHeaderWire(byte[] wire) throws Exception {
        FramedSyncStreamReader reader = new FramedSyncStreamReader(new ByteArrayInputStream(wire));
        FramedSyncPreamble preamble = reader.readPreamble();
        FramedSyncWireFrame first = reader.readFrame();
        byte[] plaintext = FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, first, 0);
        byte[] repeatedHeader = FramedSyncWireHeader.encode(
            plaintext.length + 16, 1, FramedSyncFrameType.TRANSFER_HEADER.wireValue());
        byte[] ciphertext = FramedSyncFrameCrypto.encrypt(
            GROUP_KEY, preamble, repeatedHeader, plaintext, 1);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncStreamWriter writer = new FramedSyncStreamWriter(output);
        writer.writePreamble(preamble.encoded());
        writer.writeFrame(first.headerBytes(), first.ciphertext());
        writer.writeFrame(repeatedHeader, ciphertext);
        writer.flush();
        return output.toByteArray();
    }

    private static int secondCiphertextOffset(byte[] wire) {
        int firstBody = java.nio.ByteBuffer.wrap(wire, FramedSyncPreamble.BYTES, 4).getInt();
        return FramedSyncPreamble.BYTES + FramedSyncWireHeader.BYTES + firstBody +
            FramedSyncWireHeader.BYTES;
    }

    private static byte[] wire() throws Exception {
        MemoryOutbound staging = new MemoryOutbound();
        var record = fact("original").getFact();
        FramedSyncTransferWriter.Attempt attempt = FramedSyncTransferWriter.prepare(
            GROUP_KEY, CONTEXT, Collections.singletonList(record),
            Collections.singletonList(new FramedSyncBlobContent(BLOB_HASH, BLOB)), staging);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncTransferWriter.replay(attempt, staging, output);
        return output.toByteArray();
    }

    private static int count(SQLiteDatabase database, String table) {
        try (Cursor row = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static String scalar(SQLiteDatabase database, String sql) {
        try (Cursor row = database.rawQuery(sql, null)) {
            row.moveToFirst();
            return row.getString(0);
        }
    }

    private static void reject(ThrowingRunnable action, String code) throws Exception {
        try { action.run(); fail("expected rejection: " + code); }
        catch (Exception expected) { assertEquals(code, expected.getMessage()); }
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

    private interface ThrowingRunnable { void run() throws Exception; }
}
