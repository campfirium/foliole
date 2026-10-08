package com.foliole.android.framed;

import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferManifest;
import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class FramedSyncSourceWriterFixture implements FramedSyncOutboundFactSource {
    static final FramedSyncTransferContext CONTEXT = new FramedSyncTransferContext(
        "group", "sender", "sender-epoch", "receiver", "receiver-epoch");
    final List<List<byte[]>> messages = new ArrayList<>();
    TransferHeader template;
    int reads;

    FramedSyncSourceWriterFixture(List<FactRecord> facts) throws Exception {
        List<FactRecord> ordered = FramedSyncCanonicalManifest.sortedFacts(facts);
        byte[] content = FramedSyncCanonicalManifest.contentId(ordered, Collections.emptyList());
        TransferManifest.Builder manifest = TransferManifest.newBuilder().setProtocolVersion(22)
            .setGroupId("group").setContentId(ByteString.copyFrom(content));
        for (FactRecord fact : ordered) {
            manifest.addFacts(FactDescriptor.newBuilder().setIdentity(fact.getIdentity())
                .setSharedStateHash(fact.getSharedStateHash()));
            byte[] bytes = ProtocolMessage.newBuilder().setFact(fact).build().toByteArray();
            messages.add(bytes.length <= FramedSyncContract.MAX_FRAME_MESSAGE_BYTES ?
                new ArrayList<>(Collections.singletonList(bytes)) : FramedSyncFactFragmentsTest.fragments(fact, bytes));
        }
        template = TransferHeader.newBuilder().setManifest(manifest)
            .setTransferId(ByteString.copyFrom(FramedSyncCanonicalManifest.transferId(CONTEXT, content)))
            .setAttemptId(ByteString.copyFrom(new byte[16])).build();
    }

    @Override public TransferHeader header() { return template; }

    @Override public void read(int factIndex, int fragmentIndex, Consumer consumer) throws Exception {
        reads++;
        List<byte[]> fact = messages.get(factIndex);
        if (fragmentIndex >= fact.size()) return;
        consumer.accept(fact.get(fragmentIndex), fragmentIndex == fact.size() - 1);
    }

    static final class Staging implements FramedSyncOutboundStaging {
        final List<FramedSyncAuthenticatedFrame> frames = new ArrayList<>();
        boolean prepared;
        boolean finalized;

        @Override public FramedSyncStageOutcome prepareOutboundAttempt(byte[] transfer, byte[] attempt, byte[] preamble) {
            prepared = true;
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public FramedSyncStageOutcome commitOutboundFrame(FramedSyncAuthenticatedFrame frame) {
            if (!prepared) throw new AssertionError("attempt required before ciphertext");
            frames.add(frame);
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public FramedSyncStageOutcome finalizeOutboundAttempt(byte[] transfer, byte[] attempt) {
            finalized = true;
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public void replayOutboundFrames(byte[] transfer, byte[] attempt, FramedSyncStreamWriter writer)
            throws Exception {
            for (var frame : frames) writer.writeFrame(frame.frameHeader(), frame.ciphertext());
        }
    }
}
