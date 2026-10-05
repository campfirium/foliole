package com.foliole.android.framed;

import com.foliole.sync.v22.TransferReceipt;
import java.io.InputStream;
import java.security.MessageDigest;

public final class FramedSyncReceiptReader {
    private FramedSyncReceiptReader() {}

    public static TransferReceipt read(
        InputStream input,
        byte[] groupKey,
        byte[] transferId,
        byte[] contentId,
        String receiverDeviceId,
        String receiverLibraryEpoch
    ) throws Exception {
        FramedSyncStreamReader reader = new FramedSyncStreamReader(input);
        FramedSyncPreamble preamble = reader.readPreamble();
        if (preamble.contextKind() != 2 ||
            !MessageDigest.isEqual(preamble.contextId(), transferId)) {
            throw invalid("framed_sync_receipt_context_mismatch");
        }
        FramedSyncWireFrame frame = reader.readFrame();
        if (frame == null || frame.header().frameType() != FramedSyncFrameType.TRANSFER_RECEIPT.wireValue() ||
            frame.header().sequence() != 0) {
            throw invalid("framed_sync_receipt_frame_required");
        }
        byte[] plaintext = FramedSyncFrameCrypto.decrypt(groupKey, preamble, frame, 0);
        FramedSyncValidatedMessage decoded = FramedSyncCodec.decode(
            plaintext, FramedSyncFrameType.TRANSFER_RECEIPT.wireValue());
        TransferReceipt receipt = (TransferReceipt) decoded.payload().value();
        if (reader.readFrame() != null ||
            !MessageDigest.isEqual(receipt.getTransferId().toByteArray(), transferId) ||
            !MessageDigest.isEqual(receipt.getContentId().toByteArray(), contentId) ||
            !receiverDeviceId.equals(receipt.getReceiverDeviceId()) ||
            !receiverLibraryEpoch.equals(receipt.getReceiverLibraryEpoch())) {
            throw invalid("framed_sync_receipt_identity_mismatch");
        }
        return receipt;
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
