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
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferTrailer;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
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
            GROUP_KEY, context, Collections.singletonList(fact),
            Collections.singletonList(new FramedSyncBlobContent(
                fact.getBlobs(0).getSha256().toByteArray(), body)), staging);
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

    @Test public void ordersMultipleFactsAndSupportsNoBlobTransfer() throws Exception {
        FactRecord review = factWithoutBlob(FactKind.FACT_KIND_REVIEW, "review-1");
        FactRecord relation = factWithoutBlob(FactKind.FACT_KIND_PARENT_EDGE, "parent-1");
        MemoryStaging staging = new MemoryStaging();
        FramedSyncTransferContext context = new FramedSyncTransferContext(
            "group", "sender", "sender-epoch", "receiver", "receiver-epoch");

        FramedSyncTransferWriter.Attempt attempt = FramedSyncTransferWriter.prepare(
            GROUP_KEY, context, Arrays.asList(review, relation), Collections.emptyList(), staging);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncTransferWriter.replay(attempt, staging, output);
        FramedSyncStreamReader reader = new FramedSyncStreamReader(
            new ByteArrayInputStream(output.toByteArray()));
        FramedSyncPreamble preamble = reader.readPreamble();
        int[] expectedTypes = { 2, 3, 3, 5 };
        List<FramedSyncValidatedMessage> decoded = new ArrayList<>();
        for (int sequence = 0; sequence < expectedTypes.length; sequence++) {
            FramedSyncWireFrame frame = reader.readFrame();
            decoded.add(FramedSyncCodec.decode(
                FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, frame, sequence),
                expectedTypes[sequence]));
        }
        assertEquals(FactKind.FACT_KIND_PARENT_EDGE,
            ((FactRecord) decoded.get(1).payload().value()).getIdentity().getKind());
        assertEquals(FactKind.FACT_KIND_REVIEW,
            ((FactRecord) decoded.get(2).payload().value()).getIdentity().getKind());
        com.foliole.sync.v22.TransferTrailer trailer =
            (com.foliole.sync.v22.TransferTrailer) decoded.get(3).payload().value();
        assertEquals(2, trailer.getFactCount());
        assertEquals(0, trailer.getBlobCount());
    }

    @Test public void writesZeroByteBlobInManifestWithoutAnEmptyChunk() throws Exception {
        byte[] body = new byte[0];
        FactRecord fact = fact(body);
        MemoryStaging staging = new MemoryStaging();
        FramedSyncTransferWriter.Attempt attempt = FramedSyncTransferWriter.prepare(
            GROUP_KEY, new FramedSyncTransferContext(
                "group", "sender", "sender-epoch", "receiver", "receiver-epoch"),
            Collections.singletonList(fact),
            Collections.singletonList(new FramedSyncBlobContent(
                fact.getBlobs(0).getSha256().toByteArray(), body)), staging);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncTransferWriter.replay(attempt, staging, output);
        FramedSyncStreamReader reader = new FramedSyncStreamReader(
            new ByteArrayInputStream(output.toByteArray()));
        FramedSyncPreamble preamble = reader.readPreamble();
        List<FramedSyncValidatedMessage> decoded = new ArrayList<>();
        int[] expectedTypes = { 2, 3, 5 };
        for (int sequence = 0; sequence < expectedTypes.length; sequence++) {
            FramedSyncWireFrame frame = reader.readFrame();
            decoded.add(FramedSyncCodec.decode(
                FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, frame, sequence),
                expectedTypes[sequence]));
        }
        assertEquals(null, reader.readFrame());
        TransferHeader header = (TransferHeader) decoded.get(0).payload().value();
        BlobReference descriptor = header.getManifest().getBlobs(0);
        assertEquals(0, descriptor.getByteLength());
        assertArrayEquals(MessageDigest.getInstance("SHA-256").digest(body),
            descriptor.getSha256().toByteArray());
        assertEquals(1, ((TransferTrailer) decoded.get(2).payload().value()).getBlobCount());
    }

    @Test public void streamsAFileBlobAcrossExactChunkBoundaries() throws Exception {
        byte[] body = "body".getBytes(StandardCharsets.UTF_8);
        byte[] resource = new byte[FramedSyncContract.BLOB_CHUNK_BYTES + 17];
        for (int index = 0; index < resource.length; index++) resource[index] = (byte) index;
        byte[] resourceHash = MessageDigest.getInstance("SHA-256").digest(resource);
        BlobReference resourceBlob = BlobReference.newBuilder()
            .setSha256(ByteString.copyFrom(resourceHash)).setByteLength(resource.length)
            .setRole(BlobRole.BLOB_ROLE_PDF).setRequired(true).build();
        FactRecord fact = fact(body).toBuilder().addBlobs(resourceBlob).build();
        File file = File.createTempFile("framed-sync-resource", ".pdf");
        try {
            Files.write(file.toPath(), resource);
            MemoryStaging staging = new MemoryStaging();
            FramedSyncTransferWriter.Attempt attempt = FramedSyncTransferWriter.prepare(
                GROUP_KEY, new FramedSyncTransferContext(
                    "group", "sender", "sender-epoch", "receiver", "receiver-epoch"),
                Collections.singletonList(fact), Arrays.asList(
                    new FramedSyncBlobContent(fact.getBlobs(0).getSha256().toByteArray(), body),
                    FramedSyncBlobContent.file(resourceHash, file)), staging);
            ByteArrayOutputStream wire = new ByteArrayOutputStream();
            FramedSyncTransferWriter.replay(attempt, staging, wire);
            FramedSyncStreamReader reader = new FramedSyncStreamReader(
                new ByteArrayInputStream(wire.toByteArray()));
            FramedSyncPreamble preamble = reader.readPreamble();
            ByteArrayOutputStream restored = new ByteArrayOutputStream();
            for (int sequence = 0; ; sequence++) {
                FramedSyncWireFrame frame = reader.readFrame();
                if (frame == null) break;
                byte[] plaintext = FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, frame, sequence);
                if (frame.header().frameType() != FramedSyncFrameType.BLOB_CHUNK.wireValue()) continue;
                var chunk = (com.foliole.sync.v22.BlobChunk) FramedSyncCodec.decode(
                    plaintext, frame.header().frameType()).payload().value();
                if (MessageDigest.isEqual(resourceHash, chunk.getBlobHash().toByteArray())) {
                    restored.write(chunk.getData().toByteArray());
                }
            }
            assertArrayEquals(resource, restored.toByteArray());
        } finally {
            file.delete();
        }
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

    private static FactRecord factWithoutBlob(FactKind kind, String factId) {
        return FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder()
            .setKind(kind).setObjectType("node").setGlobalId("node-1").setFactId(factId))
            .setSharedStateHash(ByteString.copyFrom(new byte[32]))
            .setBody(CanonicalObject.getDefaultInstance()).build();
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
            if (frames.isEmpty()) preparedBeforeFirstFrame = prepared;
            frames.add(frame);
            return FramedSyncStageOutcome.CREATED;
        }

        @Override public FramedSyncStageOutcome finalizeOutboundAttempt(byte[] transferId, byte[] attemptId) {
            finalized = true;
            return FramedSyncStageOutcome.CREATED;
        }

        @Override public void replayOutboundFrames(
            byte[] transferId, byte[] attemptId, FramedSyncStreamWriter writer
        ) throws Exception {
            for (FramedSyncAuthenticatedFrame frame : frames) {
                writer.writeFrame(frame.frameHeader(), frame.ciphertext());
            }
        }
    }
}
