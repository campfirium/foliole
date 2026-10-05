package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.BlobRole;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class FramedSyncTransferWriterTest {
    private static final byte[] GROUP_KEY = new byte[32];

    @Test public void persistsBeforeEncryptionAndReplaysOneBoundTransfer() throws Exception {
        byte[] body = "outbound body".getBytes(StandardCharsets.UTF_8);
        FactRecord fact = fact(body);
        MemoryStaging staging = new MemoryStaging();
        FramedSyncTransferContext context = new FramedSyncTransferContext(
            "group", "sender", "sender-epoch", "receiver", "receiver-epoch");

        FramedSyncTransferWriter.Attempt attempt = FramedSyncTransferWriter.prepare(
            GROUP_KEY, context, fact, body, staging);
        assertTrue(staging.preparedBeforeFirstFrame);
        assertTrue(staging.finalized);

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncTransferWriter.replay(attempt, staging, output);
        FramedSyncStreamReader reader = new FramedSyncStreamReader(
            new ByteArrayInputStream(output.toByteArray()));
        FramedSyncPreamble preamble = reader.readPreamble();
        assertArrayEquals(attempt.transferId(), preamble.contextId());
        int[] expectedTypes = { 2, 3, 4, 5 };
        for (int sequence = 0; sequence < expectedTypes.length; sequence++) {
            FramedSyncWireFrame frame = reader.readFrame();
            assertEquals(expectedTypes[sequence], frame.header().frameType());
            byte[] plaintext = FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, frame, sequence);
            assertEquals(expectedTypes[sequence], FramedSyncPayloadValidator.frameType(
                FramedSyncCodec.decode(plaintext, expectedTypes[sequence]).payload().payloadCase()
            ).wireValue());
        }
        assertEquals(null, reader.readFrame());
    }

    private static FactRecord fact(byte[] body) throws Exception {
        BlobReference blob = BlobReference.newBuilder()
            .setSha256(ByteString.copyFrom(MessageDigest.getInstance("SHA-256").digest(body)))
            .setByteLength(body.length).setRole(BlobRole.BLOB_ROLE_NODE_BODY).setRequired(true).build();
        return FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder()
            .setKind(FactKind.FACT_KIND_NODE_VERSION).setObjectType("node")
            .setGlobalId("node-1").setFactId("version-1"))
            .setSharedStateHash(ByteString.copyFrom(new byte[32]))
            .setBody(CanonicalObject.getDefaultInstance()).addBlobs(blob).build();
    }

    private static final class MemoryStaging implements FramedSyncOutboundStaging {
        private final List<FramedSyncAuthenticatedFrame> frames = new ArrayList<>();
        private boolean prepared;
        private boolean preparedBeforeFirstFrame;
        private boolean finalized;

        @Override public FramedSyncStageOutcome prepareOutboundAttempt(
            byte[] transferId, byte[] attemptId, byte[] preamble
        ) {
            prepared = true;
            return FramedSyncStageOutcome.CREATED;
        }

        @Override public FramedSyncStageOutcome commitOutboundFrame(FramedSyncAuthenticatedFrame frame) {
            preparedBeforeFirstFrame = prepared && frames.isEmpty();
            frames.add(frame);
            return FramedSyncStageOutcome.CREATED;
        }

        @Override public FramedSyncStageOutcome finalizeOutboundAttempt(byte[] transferId, byte[] attemptId) {
            finalized = true;
            return FramedSyncStageOutcome.CREATED;
        }

        @Override public List<FramedSyncAuthenticatedFrame> loadReplayableOutboundFrames(
            byte[] transferId, byte[] attemptId
        ) {
            return frames;
        }
    }
}
