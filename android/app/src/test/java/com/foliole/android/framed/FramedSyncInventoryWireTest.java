package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import com.foliole.sync.v22.InventoryEntry;
import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public final class FramedSyncInventoryWireTest {
    @Test public void packsLargestStablePrefixesAndImmediatelyEmitsTail() throws Exception {
        assertPageLengths(7, new int[] {6, 1});
        assertPageLengths(18, new int[] {6, 6, 6});
    }

    private static void assertPageLengths(int count, int[] lengths) throws Exception {
        List<InventoryEntry> entries = new ArrayList<>();
        String suffix = String.join("", Collections.nCopies(125, "v"));
        for (int index = 0; index < count; index++) {
            InventoryEntry.Builder entry = InventoryEntry.newBuilder().setObjectType("node")
                .setGlobalId("node-" + index)
                .setSharedStateHash(ByteString.copyFrom(new byte[32]));
            for (int version = 0; version < 900; version++) {
                entry.addFrontierFactIds("version-" + version + "-" + suffix);
            }
            entries.add(entry.build());
        }
        byte[] roundId = new byte[16];
        List<FramedSyncValidatedMessage> messages = FramedSyncInventoryWire.encode(entries, roundId);
        assertEquals(lengths.length + 2, messages.size());
        for (int index = 0; index < lengths.length; index++) {
            var message = messages.get(index + 1);
            var chunk = (com.foliole.sync.v22.InventoryChunk) message.payload().value();
            assertEquals(lengths[index], chunk.getEntriesCount());
            org.junit.Assert.assertTrue(FramedSyncCodec.encode(message).length <=
                FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES);
        }
        assertArrayEquals(roundId, FramedSyncInventoryWire.decodeRoundId(messages));
        assertEquals(entries, FramedSyncInventoryWire.decodeEntries(messages, roundId));
    }

    @Test public void roundTripsAHashedInventoryChunk() throws Exception {
        byte[] roundId = new byte[16];
        InventoryEntry entry = InventoryEntry.newBuilder()
            .setObjectType("node").setGlobalId("node-1")
            .setSharedStateHash(ByteString.copyFrom(new byte[32]))
            .addFrontierFactIds("version-1")
            .addResourceHashes(ByteString.copyFrom(new byte[32]))
            .build();

        List<FramedSyncValidatedMessage> messages = FramedSyncInventoryWire.encode(
            Collections.singletonList(entry), roundId);

        assertEquals(3, messages.size());
        assertArrayEquals(roundId, FramedSyncInventoryWire.decodeRoundId(messages));
        assertEquals(Collections.singletonList(entry),
            FramedSyncInventoryWire.decodeEntries(messages, roundId));
    }
    @Test public void retainsAllEntriesBeyondTransferFactBudget() throws Exception {
        for (int count : new int[] {4097, 10000}) {
            List<InventoryEntry> entries = new ArrayList<>();
            for (int index = 0; index < count; index++) {
                entries.add(InventoryEntry.newBuilder().setObjectType("node")
                    .setGlobalId("node-" + index)
                    .setSharedStateHash(ByteString.copyFrom(new byte[32]))
                    .addFrontierFactIds("version-" + index)
                    .addStateFactIds("node_reading:" + index).build());
            }
            byte[] roundId = new byte[16];
            List<FramedSyncValidatedMessage> encoded = FramedSyncInventoryWire.encode(entries, roundId);
            assertEquals(entries, FramedSyncInventoryWire.decodeEntries(encoded, roundId));
            FramedSyncInventoryReader streamed = new FramedSyncInventoryReader(true);
            for (FramedSyncValidatedMessage message : encoded) streamed.accept(message);
            assertEquals(entries, streamed.entries(roundId));
        }
    }

    @Test public void rejectsIncompleteAndRepeatedInventoryFrames() throws Exception {
        List<FramedSyncValidatedMessage> messages = FramedSyncInventoryWire.encode(
            Collections.emptyList(), new byte[16]);
        FramedSyncInventoryReader truncated = new FramedSyncInventoryReader(false);
        truncated.accept(messages.get(0));
        try { truncated.roundId(); fail("Incomplete inventory was accepted"); }
        catch (FramedSyncValidationException expected) { assertEquals("inventory_exchange_incomplete", expected.code()); }
        try { truncated.accept(messages.get(0)); fail("Repeated begin was accepted"); }
        catch (FramedSyncValidationException expected) { assertEquals("inventory_exchange_incomplete", expected.code()); }
        FramedSyncInventoryReader complete = new FramedSyncInventoryReader(true);
        for (FramedSyncValidatedMessage message : messages) complete.accept(message);
        byte[] otherRound = new byte[16]; otherRound[0] = 1;
        try { complete.entries(otherRound); fail("Wrong round identity was accepted"); }
        catch (FramedSyncValidationException expected) { assertEquals("inventory_round_identity_mismatch", expected.code()); }
        try { complete.accept(messages.get(1)); fail("Frame after end was accepted"); }
        catch (FramedSyncValidationException expected) { assertEquals("inventory_exchange_incomplete", expected.code()); }
    }

}
