package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import com.foliole.sync.v22.InventoryEntry;
import com.google.protobuf.ByteString;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public final class FramedSyncInventoryWireTest {
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
}
