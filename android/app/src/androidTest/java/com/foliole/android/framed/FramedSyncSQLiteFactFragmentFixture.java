package com.foliole.android.framed;

import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactFragment;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferManifest;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferTrailer;
import com.google.protobuf.ByteString;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class FramedSyncSQLiteFactFragmentFixture {
    final FactRecord fact;
    final List<ProtocolMessage> pieces = new ArrayList<>();
    final byte[] contentId;

    FramedSyncSQLiteFactFragmentFixture() throws Exception {
        CanonicalObject.Builder body = CanonicalObject.newBuilder();
        for (int index = 0; index < 2; index++) body.addFields(CanonicalField.newBuilder()
            .setName("field_" + index).setValue(CanonicalValue.newBuilder()
                .setStringValue("x".repeat(1100 * 1024))));
        fact = FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder()
            .setKind(FactKind.FACT_KIND_OBJECT_STATE).setObjectType("settings")
            .setGlobalId("settings-1").setFactId("state-1"))
            .setSharedStateHash(data(new byte[32])).setBody(body).build();
        contentId = FramedSyncCanonicalManifest.contentId(Collections.singletonList(fact), Collections.emptyList());
        byte[] encoded = ProtocolMessage.newBuilder().setFact(fact).build().toByteArray();
        ByteString hash = data(MessageDigest.getInstance("SHA-256").digest(encoded));
        for (int offset = 0; offset < encoded.length; offset += FramedSyncContract.BLOB_CHUNK_BYTES) {
            pieces.add(ProtocolMessage.newBuilder().setFactFragment(FactFragment.newBuilder()
                .setIdentity(fact.getIdentity()).setSharedStateHash(fact.getSharedStateHash())
                .setEncodedSha256(hash).setTotalByteLength(encoded.length).setOffset(offset)
                .setData(ByteString.copyFrom(encoded, offset,
                    Math.min(FramedSyncContract.BLOB_CHUNK_BYTES, encoded.length - offset)))).build());
        }
    }

    TransferProposal proposal() {
        return TransferProposal.newBuilder().setTransferId(data(FramedSyncSQLiteFixture.TRANSFER_ID))
            .setContentId(data(contentId)).setFactCount(1)
            .setSenderDeviceId("device-a").setSenderLibraryEpoch("epoch-a")
            .setReceiverDeviceId("device-b").setReceiverLibraryEpoch("epoch-b").build();
    }

    ProtocolMessage header() {
        return ProtocolMessage.newBuilder().setTransferHeader(TransferHeader.newBuilder()
            .setTransferId(data(FramedSyncSQLiteFixture.TRANSFER_ID))
            .setAttemptId(data(FramedSyncSQLiteFixture.ATTEMPT_A))
            .setManifest(TransferManifest.newBuilder().setProtocolVersion(22).setGroupId("group-a")
                .setContentId(data(contentId)).addFacts(FactDescriptor.newBuilder()
                    .setIdentity(fact.getIdentity()).setSharedStateHash(fact.getSharedStateHash())))).build();
    }

    ProtocolMessage trailer() {
        return ProtocolMessage.newBuilder().setTransferTrailer(TransferTrailer.newBuilder()
            .setTransferId(data(FramedSyncSQLiteFixture.TRANSFER_ID)).setManifestHash(data(contentId))
            .setFactCount(1)).build();
    }

    FramedSyncAuthenticatedFrame frame(long sequence, FramedSyncFrameType type, ProtocolMessage message) {
        return FramedSyncSQLiteFixture.frame(FramedSyncSQLiteFixture.ATTEMPT_A, sequence, type,
            message, new byte[] {(byte) sequence, 9});
    }

    private static ByteString data(byte[] value) { return ByteString.copyFrom(value); }
}
