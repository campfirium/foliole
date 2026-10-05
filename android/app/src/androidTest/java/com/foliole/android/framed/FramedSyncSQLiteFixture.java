package com.foliole.android.framed;

import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferManifest;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import com.foliole.sync.v22.TransferTrailer;
import com.google.protobuf.ByteString;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

final class FramedSyncSQLiteFixture {
    static final byte[] TRANSFER_ID = bytes(32, 1);
    static final byte[] ATTEMPT_A = bytes(16, 2);
    static final byte[] ATTEMPT_B = bytes(16, 3);
    static final byte[] RECEIPT_ATTEMPT = bytes(16, 4);
    static final byte[] BLOB = "body".getBytes(StandardCharsets.UTF_8);
    static final byte[] BLOB_HASH = sha256(BLOB);
    static final byte[] STATE_HASH = bytes(32, 5);
    static final byte[] APPLIED_HASH = bytes(32, 6);

    private FramedSyncSQLiteFixture() {}

    static TransferProposal proposal() throws Exception {
        return TransferProposal.newBuilder().setTransferId(data(TRANSFER_ID)).setContentId(data(contentId()))
            .setSenderDeviceId("device-a").setSenderLibraryEpoch("epoch-a")
            .setReceiverDeviceId("device-b").setReceiverLibraryEpoch("epoch-b")
            .setFactCount(1).setBlobCount(1).setTotalBlobBytes(BLOB.length).build();
    }

    static ProtocolMessage header(byte[] attemptId) throws Exception {
        FactDescriptor descriptor = FactDescriptor.newBuilder().setIdentity(identity())
            .setSharedStateHash(data(STATE_HASH)).addRequiredBlobHashes(data(BLOB_HASH)).build();
        TransferManifest manifest = TransferManifest.newBuilder()
            .setProtocolVersion(FramedSyncContract.PROTOCOL_VERSION).setGroupId("group-a")
            .setContentId(data(contentId())).addFacts(descriptor).addBlobs(blob()).build();
        return ProtocolMessage.newBuilder().setTransferHeader(TransferHeader.newBuilder()
            .setTransferId(data(TRANSFER_ID)).setAttemptId(data(attemptId)).setManifest(manifest)).build();
    }

    static ProtocolMessage fact(String title) {
        CanonicalObject body = CanonicalObject.newBuilder().addFields(CanonicalField.newBuilder()
            .setName("title").setValue(CanonicalValue.newBuilder().setStringValue(title))).build();
        FactRecord record = FactRecord.newBuilder().setIdentity(identity()).setSharedStateHash(data(STATE_HASH))
            .setBody(body).addBlobs(blob()).build();
        return ProtocolMessage.newBuilder().setFact(record).build();
    }

    static ProtocolMessage chunk() {
        return ProtocolMessage.newBuilder().setBlobChunk(BlobChunk.newBuilder()
            .setTransferId(data(TRANSFER_ID)).setBlobHash(data(BLOB_HASH)).setOffset(0).setData(data(BLOB))).build();
    }

    static ProtocolMessage trailer() throws Exception {
        return ProtocolMessage.newBuilder().setTransferTrailer(TransferTrailer.newBuilder()
            .setTransferId(data(TRANSFER_ID)).setManifestHash(data(contentId()))
            .setFactCount(1).setBlobCount(1)).build();
    }

    static TransferReceipt receipt() throws Exception {
        return TransferReceipt.newBuilder().setTransferId(data(TRANSFER_ID)).setContentId(data(contentId()))
            .setReceiverDeviceId("device-b").setReceiverLibraryEpoch("epoch-b")
            .setAppliedStateHash(data(APPLIED_HASH)).build();
    }

    static FramedSyncAuthenticatedFrame frame(
        byte[] attemptId,
        long sequence,
        FramedSyncFrameType type,
        ProtocolMessage message,
        byte[] ciphertext
    ) {
        return new FramedSyncAuthenticatedFrame(TRANSFER_ID, attemptId, preamble(),
            FramedSyncWireHeader.encode(ciphertext.length, sequence, type.wireValue()),
            ciphertext, message.toByteArray());
    }

    static byte[] preamble() {
        ByteBuffer value = ByteBuffer.allocate(FramedSyncPreamble.BYTES).order(ByteOrder.BIG_ENDIAN);
        value.put("FOLSYNC2".getBytes(StandardCharsets.US_ASCII));
        value.putShort((short) FramedSyncPreamble.BYTES);
        value.putShort((short) FramedSyncContract.PROTOCOL_VERSION);
        value.put((byte) 2).put((byte) 0).putShort((short) 0);
        value.position(76);
        return value.array();
    }

    private static FactIdentity identity() {
        return FactIdentity.newBuilder().setKind(FactKind.FACT_KIND_NODE_VERSION)
            .setObjectType("node").setGlobalId("node-1").setFactId("version-1").build();
    }

    private static BlobReference blob() {
        return BlobReference.newBuilder().setSha256(data(BLOB_HASH)).setByteLength(BLOB.length)
            .setRoleValue(1).setRequired(true).build();
    }

    private static byte[] contentId() throws Exception {
        return FramedSyncCanonicalManifest.contentId(
            List.of(fact("original").getFact()), List.of(blob()));
    }

    private static ByteString data(byte[] value) { return ByteString.copyFrom(value); }
    private static byte[] sha256(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }
    private static byte[] bytes(int size, int value) {
        byte[] result = new byte[size];
        java.util.Arrays.fill(result, (byte) value);
        return result;
    }
}
