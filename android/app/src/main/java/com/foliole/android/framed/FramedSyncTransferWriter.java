package com.foliole.android.framed;

import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferManifest;
import com.foliole.sync.v22.TransferTrailer;
import com.google.protobuf.ByteString;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;

public final class FramedSyncTransferWriter {
    private static final SecureRandom RANDOM = new SecureRandom();

    public static final class Attempt {
        private final byte[] transferId;
        private final byte[] attemptId;
        private final byte[] preamble;

        Attempt(byte[] transferId, byte[] attemptId, byte[] preamble) {
            this.transferId = transferId.clone();
            this.attemptId = attemptId.clone();
            this.preamble = preamble.clone();
        }

        public byte[] transferId() { return transferId.clone(); }
        public byte[] attemptId() { return attemptId.clone(); }
        public byte[] preamble() { return preamble.clone(); }
    }

    private FramedSyncTransferWriter() {}

    public static Attempt prepare(
        byte[] groupKey,
        FramedSyncTransferContext context,
        FactRecord fact,
        byte[] blobData,
        FramedSyncOutboundStaging staging
    ) throws Exception {
        BlobReference blob = singleVerifiedBlob(fact, blobData);
        byte[] contentId = FramedSyncCanonicalManifest.contentId(
            Collections.singletonList(fact), Collections.singletonList(blob));
        byte[] transferId = FramedSyncCanonicalManifest.transferId(context, contentId);
        byte[] attemptId = random(FramedSyncContract.IDENTIFIER_BYTES);
        FramedSyncPreamble preamble = FramedSyncPreamble.transfer(transferId, attemptId, random(4));
        staging.prepareOutboundAttempt(transferId, attemptId, preamble.encoded());
        long sequence = 0;
        sequence = persist(groupKey, preamble, transferId, attemptId, sequence,
            FramedSyncFrameType.TRANSFER_HEADER, header(context, fact, blob, contentId, transferId, attemptId), staging);
        sequence = persist(groupKey, preamble, transferId, attemptId, sequence,
            FramedSyncFrameType.FACT, ProtocolMessage.newBuilder().setFact(fact).build(), staging);
        for (int offset = 0; offset < blobData.length || offset == 0; offset += FramedSyncContract.BLOB_CHUNK_BYTES) {
            int length = Math.min(FramedSyncContract.BLOB_CHUNK_BYTES, blobData.length - offset);
            ByteString data = ByteString.copyFrom(blobData, offset, Math.max(length, 0));
            ProtocolMessage chunk = ProtocolMessage.newBuilder().setBlobChunk(BlobChunk.newBuilder()
                .setTransferId(ByteString.copyFrom(transferId)).setBlobHash(blob.getSha256())
                .setOffset(Integer.toUnsignedLong(offset)).setData(data)).build();
            sequence = persist(groupKey, preamble, transferId, attemptId, sequence,
                FramedSyncFrameType.BLOB_CHUNK, chunk, staging);
            if (blobData.length == 0) break;
        }
        persist(groupKey, preamble, transferId, attemptId, sequence,
            FramedSyncFrameType.TRANSFER_TRAILER, trailer(contentId, transferId), staging);
        staging.finalizeOutboundAttempt(transferId, attemptId);
        return new Attempt(transferId, attemptId, preamble.encoded());
    }

    public static void replay(Attempt attempt, FramedSyncOutboundStaging staging, OutputStream output)
        throws Exception {
        replay(attempt, staging, new FramedSyncStreamWriter(output));
    }

    public static void replay(
        Attempt attempt,
        FramedSyncOutboundStaging staging,
        FramedSyncStreamWriter writer
    ) throws Exception {
        writer.writePreamble(attempt.preamble());
        for (FramedSyncAuthenticatedFrame frame :
            staging.loadReplayableOutboundFrames(attempt.transferId(), attempt.attemptId())) {
            writer.writeFrame(frame.frameHeader(), frame.ciphertext());
        }
        writer.flush();
    }

    private static long persist(
        byte[] groupKey, FramedSyncPreamble preamble, byte[] transferId, byte[] attemptId,
        long sequence, FramedSyncFrameType type, ProtocolMessage message,
        FramedSyncOutboundStaging staging
    ) throws Exception {
        FramedSyncValidatedMessage validated = FramedSyncCodec.validateOutbound(message, type.wireValue());
        byte[] plaintext = FramedSyncCodec.encode(validated);
        byte[] header = FramedSyncWireHeader.encode(plaintext.length + 16, sequence, type.wireValue());
        byte[] ciphertext = FramedSyncFrameCrypto.encrypt(groupKey, preamble, header, plaintext, sequence);
        staging.commitOutboundFrame(new FramedSyncAuthenticatedFrame(
            transferId, attemptId, preamble.encoded(), header, ciphertext, plaintext));
        return sequence + 1;
    }

    private static ProtocolMessage header(
        FramedSyncTransferContext context, FactRecord fact, BlobReference blob,
        byte[] contentId, byte[] transferId, byte[] attemptId
    ) {
        FactDescriptor.Builder descriptor = FactDescriptor.newBuilder().setIdentity(fact.getIdentity())
            .setSharedStateHash(fact.getSharedStateHash());
        for (BlobReference edge : fact.getBlobsList()) {
            if (edge.getRequired()) descriptor.addRequiredBlobHashes(edge.getSha256());
        }
        TransferManifest manifest = TransferManifest.newBuilder()
            .setProtocolVersion(FramedSyncContract.PROTOCOL_VERSION).setGroupId(context.groupId())
            .setContentId(ByteString.copyFrom(contentId)).addFacts(descriptor).addBlobs(blob).build();
        return ProtocolMessage.newBuilder().setTransferHeader(TransferHeader.newBuilder()
            .setTransferId(ByteString.copyFrom(transferId)).setAttemptId(ByteString.copyFrom(attemptId))
            .setManifest(manifest)).build();
    }

    private static ProtocolMessage trailer(byte[] contentId, byte[] transferId) {
        return ProtocolMessage.newBuilder().setTransferTrailer(TransferTrailer.newBuilder()
            .setTransferId(ByteString.copyFrom(transferId)).setManifestHash(ByteString.copyFrom(contentId))
            .setFactCount(1).setBlobCount(1)).build();
    }

    private static BlobReference singleVerifiedBlob(FactRecord fact, byte[] data) throws Exception {
        if (fact.getBlobsCount() != 1) throw new FramedSyncValidationException("framed_sync_blob_set_unsupported");
        BlobReference blob = fact.getBlobs(0);
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
        if (blob.getByteLength() != data.length || !MessageDigest.isEqual(blob.getSha256().toByteArray(), digest)) {
            throw new FramedSyncValidationException("framed_sync_blob_content_mismatch");
        }
        return blob;
    }

    private static byte[] random(int length) {
        byte[] result = new byte[length];
        RANDOM.nextBytes(result);
        return result;
    }
}
