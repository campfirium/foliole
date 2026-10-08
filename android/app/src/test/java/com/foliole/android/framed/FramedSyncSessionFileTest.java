package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.foliole.sync.v22.InventoryEntry;
import com.google.protobuf.ByteString;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class FramedSyncSessionFileTest {
    @Test public void signsAndReplaysEveryInventoryPageWithoutAWholeRequestBuffer() throws Exception {
        File directory = Files.createTempDirectory("framed-session-test-").toFile();
        byte[] key = new byte[32];
        byte[] round = new byte[16];
        FramedSyncSessionContext context = new FramedSyncSessionContext("group-a", "a", "ea", "b", "eb");
        List<InventoryEntry> entries = new ArrayList<>();
        for (int index = 0; index < 10000; index++) entries.add(InventoryEntry.newBuilder()
            .setObjectType("node").setGlobalId("node-" + index)
            .setSharedStateHash(ByteString.copyFrom(new byte[32])).addFrontierFactIds("version-" + index).build());
        boolean[] persisted = { false };
        try {
            try (FramedSyncSessionFile file = FramedSyncSessionFile.create(directory, key, context,
                consumer -> { assertTrue(persisted[0]); FramedSyncInventoryWire.emit(entries, round, consumer); },
                (session, id, prefix, sequence) -> persisted[0] = true)) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                file.replay(new FramedSyncStreamWriter(bytes));
                assertEquals(file.length(), bytes.size());
                StringBuilder digest = new StringBuilder();
                for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray())) {
                    digest.append(String.format("%02x", value & 255));
                }
                assertEquals(file.sha256(), digest.toString());
                FramedSyncSessionReader.Result read = FramedSyncSessionReader.read(
                    new java.io.ByteArrayInputStream(bytes.toByteArray()), key, context, FramedSyncContract.MAX_SESSION_FRAMES);
                assertEquals(entries, FramedSyncInventoryWire.decodeEntries(read.messages(), round));
                FramedSyncInventoryReader inventory = new FramedSyncInventoryReader(true);
                FramedSyncSessionReader.Result streamed = FramedSyncSessionReader.readEach(
                    new FramedSyncStreamReader(new java.io.ByteArrayInputStream(bytes.toByteArray())),
                    key, context, FramedSyncContract.MAX_SESSION_FRAMES, inventory::accept);
                assertTrue(streamed.messages().isEmpty());
                assertEquals(entries, inventory.entries(round));
                FramedSyncInventoryReader responder = new FramedSyncInventoryReader(false);
                for (FramedSyncValidatedMessage message : read.messages()) responder.accept(message);
                assertArrayEquals(round, responder.roundId());
                ByteArrayOutputStream copy = new ByteArrayOutputStream();
                file.copyTo(copy);
                assertArrayEquals(bytes.toByteArray(), copy.toByteArray());
            }
            assertEquals(0, directory.list().length);
        } finally { directory.delete(); }
    }

    @Test public void removesThePartialRequestWhenItsProducerFails() throws Exception {
        File directory = Files.createTempDirectory("framed-session-failure-").toFile();
        try {
            try {
                FramedSyncSessionFile.create(directory, new byte[32],
                    new FramedSyncSessionContext("g", "a", "ea", "b", "eb"),
                    consumer -> { throw new java.io.IOException("source_failed"); },
                    (session, id, prefix, sequence) -> {});
                fail("Expected producer failure");
            } catch (java.io.IOException error) { assertEquals("source_failed", error.getMessage()); }
            assertEquals(0, directory.list().length);
        } finally { directory.delete(); }
    }
}
