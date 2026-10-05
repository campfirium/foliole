package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferReceipt;
import java.io.ByteArrayOutputStream;
import java.security.SecureRandom;

public final class FramedSyncReceiptWriter {
    private static final SecureRandom RANDOM = new SecureRandom();

    private FramedSyncReceiptWriter() {}

    public static byte[] encode(
        byte[] groupKey,
        TransferReceipt receipt,
        FramedSyncDurableStaging staging
    ) throws Exception {
        byte[] transferId = receipt.getTransferId().toByteArray();
        byte[] attemptId = random(FramedSyncContract.IDENTIFIER_BYTES);
        FramedSyncPreamble preamble = FramedSyncPreamble.transfer(transferId, attemptId, random(4));
        FramedSyncValidatedMessage message = FramedSyncCodec.validateOutbound(
            ProtocolMessage.newBuilder().setTransferReceipt(receipt).build(),
            FramedSyncFrameType.TRANSFER_RECEIPT.wireValue());
        byte[] plaintext = FramedSyncCodec.encode(message);
        byte[] header = FramedSyncWireHeader.encode(
            plaintext.length + 16, 0, FramedSyncFrameType.TRANSFER_RECEIPT.wireValue());
        staging.commitReceipt(receipt);
        staging.prepareReceiptAttempt(transferId, attemptId, preamble.encoded());
        byte[] ciphertext = FramedSyncFrameCrypto.encrypt(
            groupKey, preamble, header, plaintext, 0);
        new FramedSyncInboundStagingAdapter(staging).commitAuthenticatedFrame(
            new FramedSyncAuthenticatedFrame(transferId, attemptId, preamble.encoded(),
                header, ciphertext, plaintext));
        staging.finalizeReceiptAttempt(transferId, attemptId);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(preamble.encoded());
        for (FramedSyncAuthenticatedFrame frame :
            staging.loadReplayableReceiptFrames(transferId, attemptId)) {
            output.write(frame.frameHeader());
            output.write(frame.ciphertext());
        }
        return output.toByteArray();
    }

    private static byte[] random(int length) {
        byte[] result = new byte[length];
        RANDOM.nextBytes(result);
        return result;
    }
}
