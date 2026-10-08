package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;

import com.foliole.sync.v22.DifferenceRequest;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public final class FramedSyncSessionRequestTest {
    private final byte[] key = new byte[32];
    private final byte[] round = new byte[16];
    private final FramedSyncSessionContext context = new FramedSyncSessionContext("group", "a", "ea", "b", "eb");
    private final FramedSyncSessionNonceStore nonces = (session, identity, prefix, sequence) -> {};

    private FramedSyncValidatedMessage difference() throws Exception {
        return difference("node-1", round, 1, 0);
    }
    private FramedSyncValidatedMessage difference(String object, byte[] roundId, int count, int padding) throws Exception {
        var request = DifferenceRequest.newBuilder().setRoundId(ByteString.copyFrom(roundId));
        for (int i = 0; i < count; i++) request.addFacts(FactIdentity.newBuilder().setKind(FactKind.FACT_KIND_NODE_VERSION)
            .setObjectType("node").setGlobalId(object).setFactId("version-" + i + "x".repeat(padding)));
        return FramedSyncCodec.validateOutbound(ProtocolMessage.newBuilder().setDifferenceRequest(request).build(), 1);
    }
    private FramedSyncSessionRequest read(byte[] encoded) throws Exception {
        return FramedSyncSessionRequest.read(new ByteArrayInputStream(encoded), key, context);
    }

    private byte[] encode(List<FramedSyncValidatedMessage> messages) throws Exception {
        return FramedSyncSessionWriter.encode(key, context, messages, nonces);
    }

    @Test public void preservesTheSingleAuthenticatedDifferenceWithoutInventingInventory() throws Exception {
        var difference = difference();
        var request = read(encode(Collections.singletonList(difference)));
        assertTrue(request.isDifference());
        assertArrayEquals(FramedSyncCodec.encode(difference), request.differenceBytes());
        assertThrows(Exception.class, request::roundId);
    }

    @Test public void requiresCompleteInventoryAndPreservesItsRound() throws Exception {
        var inventory = FramedSyncInventoryWire.encode(Collections.emptyList(), round);
        var request = read(encode(inventory));
        assertFalse(request.isDifference());
        assertArrayEquals(round, request.roundId());
        assertThrows(Exception.class, () -> read(encode(inventory.subList(0, 1))));
        assertThrows(Exception.class, () -> read(encode(Collections.emptyList())));
    }

    @Test public void rejectsDuplicateDifferenceAndBothMixedRequestOrders() throws Exception {
        var difference = difference();
        assertThrows(Exception.class, () -> read(encode(List.of(difference, difference))));
        var mixed = new ArrayList<>(FramedSyncInventoryWire.encode(Collections.emptyList(), round));
        mixed.add(difference);
        assertThrows(Exception.class, () -> read(encode(mixed)));
        Collections.reverse(mixed);
        assertThrows(Exception.class, () -> read(encode(mixed)));
    }

    @Test public void acceptsOrderedIndependentDifferencesAndRejectsWrongRoundCountAndMetadataSize() throws Exception {
        var first = difference();
        var second = difference("node-2", round, 1, 0);
        var request = read(encode(List.of(first, second)));
        assertEquals(2, request.differenceCount());
        assertArrayEquals(FramedSyncCodec.encode(first), request.differenceBytes(0));
        assertArrayEquals(FramedSyncCodec.encode(second), request.differenceBytes(1));
        byte[] otherRound = round.clone(); otherRound[0] = 1;
        assertThrows(Exception.class, () -> read(encode(List.of(first, difference("node-2", otherRound, 1, 0)))));
        var many = new ArrayList<FramedSyncValidatedMessage>();
        for (int i = 0; i < 128; i++) many.add(difference("node-" + i, round, 1, 0));
        assertEquals(128, read(encode(many)).differenceCount());
        many.add(difference("node-extra", round, 1, 0));
        assertThrows(Exception.class, () -> read(encode(many)));
        assertThrows(Exception.class, () -> read(encode(List.of(difference("node-1", round, 1500, 260),
            difference("node-2", round, 1500, 260)))));
    }

    @Test public void preservesSingletonResourceAndRejectsResourceBatchOrBadAuthenticatedSuffix() throws Exception {
        var demand = com.foliole.sync.v22.ResourceDemand.newBuilder().setDemandId("demand").setGlobalId("node")
            .setVersionId("version").setBodyHash("a".repeat(64)).setStorageKey("b".repeat(64) + ".png")
            .setSharedStateHash(ByteString.copyFrom(new byte[32]));
        var resource = FramedSyncCodec.validateOutbound(ProtocolMessage.newBuilder().setDifferenceRequest(
            DifferenceRequest.newBuilder().setRoundId(ByteString.copyFrom(round)).addResources(demand)).build(), 1);
        assertEquals(1, read(encode(List.of(resource))).differenceCount());
        assertThrows(Exception.class, () -> read(encode(List.of(resource, difference()))));
        assertThrows(Exception.class, () -> read(encode(List.of(difference(), resource))));
        byte[] batch = encode(List.of(difference(), difference("node-2", round, 1, 0)));
        assertThrows(Exception.class, () -> read(java.util.Arrays.copyOf(batch, batch.length - 1)));
        batch[batch.length - 1] ^= 1;
        assertThrows(Exception.class, () -> read(batch));
    }

    @Test public void rejectsTamperingTruncationAndWrongContextBeforeDispatch() throws Exception {
        byte[] encoded = encode(Collections.singletonList(difference()));
        assertThrows(Exception.class, () -> read(java.util.Arrays.copyOf(encoded, encoded.length - 1)));
        assertThrows(Exception.class, () -> FramedSyncSessionRequest.read(new ByteArrayInputStream(encoded), key,
            new FramedSyncSessionContext("group", "a", "ea", "b", "wrong")));
        encoded[encoded.length - 1] ^= 1;
        assertThrows(Exception.class, () -> read(encoded));
    }
}
