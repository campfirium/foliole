package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferManifest;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import com.google.protobuf.ByteString;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.Test;

public final class FramedSyncInboundStagingAdapterTest {
    private static final byte[] TRANSFER_ID = bytes(32, 1);
    private static final byte[] ATTEMPT_ID = bytes(16, 2);

    @Test
    public void decodesAndValidatesBeforeCallingDurableStaging() throws Exception {
        RecordingStaging staging = new RecordingStaging();
        FramedSyncInboundStagingAdapter adapter = new FramedSyncInboundStagingAdapter(staging);
        ProtocolMessage message = transferHeader();

        assertEquals(FramedSyncStageOutcome.CREATED, adapter.commitAuthenticatedFrame(
            frame(9, FramedSyncFrameType.TRANSFER_HEADER, message.toByteArray())));

        assertEquals(1, staging.commits);
        assertNotNull(staging.staged);
        assertEquals(FramedSyncPayload.Case.TRANSFER_HEADER, staging.staged.payload().payloadCase());
    }

    @Test
    public void invalidOrMismatchedPayloadNeverReachesDurableStaging() throws Exception {
        RecordingStaging staging = new RecordingStaging();
        FramedSyncInboundStagingAdapter adapter = new FramedSyncInboundStagingAdapter(staging);
        reject(() -> adapter.commitAuthenticatedFrame(
            frame(0, FramedSyncFrameType.TRANSFER_HEADER, new byte[] {1, 2, 3})),
            "protocol_decode_invalid");
        reject(() -> adapter.commitAuthenticatedFrame(
            frame(0, FramedSyncFrameType.FACT, transferHeader().toByteArray())),
            "frame_payload_type_mismatch");
        assertEquals(0, staging.commits);
    }

    private static ProtocolMessage transferHeader() {
        TransferManifest manifest = TransferManifest.newBuilder()
            .setProtocolVersion(FramedSyncContract.PROTOCOL_VERSION)
            .setGroupId("group-a").setContentId(ByteString.copyFrom(bytes(32, 3))).build();
        return ProtocolMessage.newBuilder().setTransferHeader(TransferHeader.newBuilder()
            .setTransferId(ByteString.copyFrom(TRANSFER_ID))
            .setAttemptId(ByteString.copyFrom(ATTEMPT_ID)).setManifest(manifest)).build();
    }

    private static FramedSyncAuthenticatedFrame frame(
        long sequence,
        FramedSyncFrameType type,
        byte[] plaintext
    ) {
        byte[] ciphertext = new byte[] {7, 8, 9};
        return new FramedSyncAuthenticatedFrame(TRANSFER_ID, ATTEMPT_ID, preamble(),
            FramedSyncWireHeader.encode(ciphertext.length, sequence, type.wireValue()),
            ciphertext, plaintext);
    }

    private static byte[] preamble() {
        ByteBuffer value = ByteBuffer.allocate(FramedSyncPreamble.BYTES).order(ByteOrder.BIG_ENDIAN);
        value.put("FOLSYNC2".getBytes(StandardCharsets.US_ASCII));
        value.putShort((short) FramedSyncPreamble.BYTES);
        value.putShort((short) FramedSyncContract.PROTOCOL_VERSION);
        value.put((byte) 2).put((byte) 0).putShort((short) 0);
        value.position(76);
        return value.array();
    }

    private static byte[] bytes(int size, int value) {
        byte[] result = new byte[size];
        java.util.Arrays.fill(result, (byte) value);
        return result;
    }

    private static void reject(ThrowingRunnable action, String message) throws Exception {
        try {
            action.run();
            fail("expected rejection: " + message);
        } catch (FramedSyncValidationException expected) {
            assertEquals(message, expected.getMessage());
        }
    }

    private static final class RecordingStaging implements FramedSyncDurableStaging {
        private int commits;
        private FramedSyncValidatedMessage staged;

        @Override public FramedSyncStageOutcome admitInboundTransfer(TransferProposal value) {
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public FramedSyncStageOutcome commitInboundFrame(
            FramedSyncAuthenticatedFrame frame, FramedSyncValidatedMessage message) {
            commits += 1;
            staged = message;
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public void invalidateInboundAttempt(byte[] transferId, byte[] attemptId) {}
        @Override public FramedSyncStageOutcome commitReceipt(TransferReceipt receipt) {
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public FramedSyncStageOutcome prepareReceiptAttempt(
            byte[] transferId, byte[] attemptId, byte[] preamble) {
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public FramedSyncStageOutcome finalizeReceiptAttempt(byte[] transferId, byte[] attemptId) {
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public List<FramedSyncAuthenticatedFrame> loadReplayableReceiptFrames(
            byte[] transferId, byte[] attemptId) { return List.of(); }
    }

    private interface ThrowingRunnable { void run() throws Exception; }
}
