package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.foliole.sync.v22.InventoryBegin;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import org.junit.Test;

public final class FramedSyncSessionWriterTest {
    private static final byte[] GROUP_KEY = new byte[32];

    @Test public void persistsNonceStateBeforeProducingRoundTrippableCiphertext() throws Exception {
        FramedSyncSessionContext context = new FramedSyncSessionContext(
            "group-a", "device-a", "epoch-a", "device-b", "epoch-b");
        ProtocolMessage wire = ProtocolMessage.newBuilder().setInventoryBegin(
            InventoryBegin.newBuilder().setRoundId(ByteString.copyFrom(new byte[16])).setEntryCount(0)
        ).build();
        FramedSyncValidatedMessage message = FramedSyncCodec.validateOutbound(
            wire, FramedSyncFrameType.SESSION_CONTROL.wireValue());
        RecordingNonceStore nonceStore = new RecordingNonceStore();

        byte[] encoded = FramedSyncSessionWriter.encode(
            GROUP_KEY, context, Collections.singletonList(message), nonceStore);
        FramedSyncSessionReader.Result decoded = FramedSyncSessionReader.read(
            new ByteArrayInputStream(encoded), GROUP_KEY, context, 1);

        assertTrue(nonceStore.persisted);
        assertEquals(FramedSyncPayload.Case.INVENTORY_BEGIN,
            decoded.messages().get(0).payload().payloadCase());
    }

    private static final class RecordingNonceStore implements FramedSyncSessionNonceStore {
        private boolean persisted;

        @Override public void persistBeforeEncryption(
            byte[] sessionId, byte[] contextId, byte[] noncePrefix, long startingSequence
        ) {
            persisted = sessionId.length == 16 && contextId.length == 32 &&
                noncePrefix.length == 4 && startingSequence == 0;
        }
    }
}
