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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    public static final class BlobContent {
        private final byte[] data;
        private final byte[] sha256;

        public BlobContent(byte[] sha256, byte[] data) {
            this.sha256 = sha256.clone();
            this.data = data.clone();
        }

        byte[] data() { return data.clone(); }
        byte[] sha256() { return sha256.clone(); }
    }

    private FramedSyncTransferWriter() {}

    public static Attempt prepare(
        byte[] groupKey,
        FramedSyncTransferContext context,
        List<FactRecord> facts,
        List<BlobContent> blobContents,
        FramedSyncOutboundStaging staging
    ) throws Exception {
        List<FactRecord> orderedFacts = facts(facts);
        List<BlobReference> blobs = manifestBlobs(orderedFacts);
        List<BlobContent> contents = verifiedBlobContents(blobs, blobContents);
        byte[] contentId = FramedSyncCanonicalManifest.contentId(orderedFacts, blobs);
        byte[] transferId = FramedSyncCanonicalManifest.transferId(context, contentId);
        byte[] attemptId = random(FramedSyncContract.IDENTIFIER_BYTES);
        FramedSyncPreamble preamble = FramedSyncPreamble.transfer(transferId, attemptId, random(4));
        staging.prepareOutboundAttempt(transferId, attemptId, preamble.encoded());
        long sequence = 0;
        sequence = persist(groupKey, preamble, transferId, attemptId, sequence,
            FramedSyncFrameType.TRANSFER_HEADER,
            header(context, orderedFacts, blobs, contentId, transferId, attemptId), staging);
        for (FactRecord fact : orderedFacts) {
            sequence = persist(groupKey, preamble, transferId, attemptId, sequence,
                FramedSyncFrameType.FACT, ProtocolMessage.newBuilder().setFact(fact).build(), staging);
        }
        for (BlobContent content : contents) {
            byte[] data = content.data();
            for (int offset = 0; offset < data.length; offset += FramedSyncContract.BLOB_CHUNK_BYTES) {
                int length = Math.min(FramedSyncContract.BLOB_CHUNK_BYTES, data.length - offset);
                ProtocolMessage chunk = ProtocolMessage.newBuilder().setBlobChunk(BlobChunk.newBuilder()
                    .setTransferId(ByteString.copyFrom(transferId))
                    .setBlobHash(ByteString.copyFrom(content.sha256()))
                    .setOffset(Integer.toUnsignedLong(offset))
                    .setData(ByteString.copyFrom(data, offset, length))).build();
                sequence = persist(groupKey, preamble, transferId, attemptId, sequence,
                    FramedSyncFrameType.BLOB_CHUNK, chunk, staging);
            }
        }
        persist(groupKey, preamble, transferId, attemptId, sequence,
            FramedSyncFrameType.TRANSFER_TRAILER,
            trailer(contentId, transferId, orderedFacts.size(), blobs.size()), staging);
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
        FramedSyncTransferContext context, List<FactRecord> facts, List<BlobReference> blobs,
        byte[] contentId, byte[] transferId, byte[] attemptId
    ) {
        TransferManifest.Builder manifest = TransferManifest.newBuilder()
            .setProtocolVersion(FramedSyncContract.PROTOCOL_VERSION).setGroupId(context.groupId())
            .setContentId(ByteString.copyFrom(contentId)).addAllBlobs(blobs);
        for (FactRecord fact : facts) {
            FactDescriptor.Builder descriptor = FactDescriptor.newBuilder()
                .setIdentity(fact.getIdentity()).setSharedStateHash(fact.getSharedStateHash());
            for (BlobReference edge : FramedSyncCanonicalManifest.sortedBlobs(fact.getBlobsList())) {
                if (edge.getRequired()) descriptor.addRequiredBlobHashes(edge.getSha256());
            }
            manifest.addFacts(descriptor);
        }
        return ProtocolMessage.newBuilder().setTransferHeader(TransferHeader.newBuilder()
            .setTransferId(ByteString.copyFrom(transferId)).setAttemptId(ByteString.copyFrom(attemptId))
            .setManifest(manifest)).build();
    }

    private static ProtocolMessage trailer(
        byte[] contentId, byte[] transferId, int factCount, int blobCount
    ) {
        return ProtocolMessage.newBuilder().setTransferTrailer(TransferTrailer.newBuilder()
            .setTransferId(ByteString.copyFrom(transferId)).setManifestHash(ByteString.copyFrom(contentId))
            .setFactCount(factCount).setBlobCount(blobCount)).build();
    }

    private static List<FactRecord> facts(List<FactRecord> values) throws Exception {
        if (values == null || values.isEmpty() || values.size() > FramedSyncContract.MAX_FACTS_PER_TRANSFER) {
            throw new FramedSyncValidationException("framed_sync_fact_set_invalid");
        }
        List<FactRecord> result = FramedSyncCanonicalManifest.sortedFacts(values);
        Map<String, FactRecord> identities = new LinkedHashMap<>();
        for (FactRecord fact : result) {
            FramedSyncCodec.validateOutbound(
                ProtocolMessage.newBuilder().setFact(fact).build(), FramedSyncFrameType.FACT.wireValue());
            String identity = fact.getIdentity().getKindValue() + "\0" +
                fact.getIdentity().getObjectType() + "\0" + fact.getIdentity().getGlobalId() + "\0" +
                fact.getIdentity().getFactId();
            if (identities.put(identity, fact) != null) {
                throw new FramedSyncValidationException("framed_sync_fact_duplicate");
            }
        }
        return result;
    }

    private static List<BlobReference> manifestBlobs(List<FactRecord> facts) throws Exception {
        Map<String, BlobReference> blobs = new LinkedHashMap<>();
        for (FactRecord fact : facts) for (BlobReference blob : fact.getBlobsList()) {
            String key = hex(blob.getSha256().toByteArray());
            BlobReference prior = blobs.putIfAbsent(key, blob);
            if (prior != null && !prior.equals(blob)) {
                throw new FramedSyncValidationException("framed_sync_blob_descriptor_conflict");
            }
        }
        if (blobs.size() > FramedSyncContract.MAX_BLOBS_PER_TRANSFER) {
            throw new FramedSyncValidationException("framed_sync_blob_set_invalid");
        }
        return FramedSyncCanonicalManifest.sortedBlobs(new ArrayList<>(blobs.values()));
    }

    private static List<BlobContent> verifiedBlobContents(
        List<BlobReference> blobs,
        List<BlobContent> contents
    ) throws Exception {
        Map<String, BlobContent> byHash = new LinkedHashMap<>();
        for (BlobContent content : contents) {
            String key = hex(content.sha256());
            if (byHash.put(key, content) != null) {
                throw new FramedSyncValidationException("framed_sync_blob_content_set_mismatch");
            }
        }
        if (byHash.size() != blobs.size()) {
            throw new FramedSyncValidationException("framed_sync_blob_content_set_mismatch");
        }
        List<BlobContent> result = new ArrayList<>();
        for (BlobReference blob : blobs) {
            BlobContent content = byHash.get(hex(blob.getSha256().toByteArray()));
            byte[] data = content == null ? null : content.data();
            if (data == null || blob.getByteLength() != data.length || !MessageDigest.isEqual(
                blob.getSha256().toByteArray(), MessageDigest.getInstance("SHA-256").digest(data))) {
                throw new FramedSyncValidationException("framed_sync_blob_content_mismatch");
            }
            result.add(content);
        }
        return result;
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", Byte.toUnsignedInt(item)));
        return result.toString();
    }

    private static byte[] random(int length) {
        byte[] result = new byte[length];
        RANDOM.nextBytes(result);
        return result;
    }
}
