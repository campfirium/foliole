package com.foliole.android.framed;

import com.foliole.sync.v22.TransferReceipt;
import java.io.InputStream;
import java.security.MessageDigest;

public final class FramedSyncReceiptReader {
    private FramedSyncReceiptReader() {}

    public static TransferReceipt read(InputStream input, byte[] groupKey, byte[] transferId,
        byte[] contentId, String receiverDeviceId, String receiverLibraryEpoch, FramedSyncPayloadBudget budget)
        throws Exception {
        return read(new FramedSyncStreamReader(input), groupKey, transferId, contentId,
            receiverDeviceId, receiverLibraryEpoch, budget);
    }

    public static TransferReceipt read(FramedSyncStreamReader reader, byte[] groupKey, byte[] transferId,
        byte[] contentId, String receiverDeviceId, String receiverLibraryEpoch, FramedSyncPayloadBudget budget)
        throws Exception {
        return read(reader.budgeted(budget, FramedSyncPayloadBudget.Direction.INBOUND,
            FramedSyncPayloadBudget.Lane.RECEIPT), groupKey, transferId, contentId,
            receiverDeviceId, receiverLibraryEpoch);
    }

    public static TransferReceipt read(
        InputStream input,
        byte[] groupKey,
        byte[] transferId,
        byte[] contentId,
        String receiverDeviceId,
        String receiverLibraryEpoch
    ) throws Exception {
        return read(new FramedSyncStreamReader(input), groupKey, transferId, contentId,
            receiverDeviceId, receiverLibraryEpoch);
    }

    public static TransferReceipt read(
        FramedSyncStreamReader reader,
        byte[] groupKey,
        byte[] transferId,
        byte[] contentId,
        String receiverDeviceId,
        String receiverLibraryEpoch
    ) throws Exception {
        FramedSyncPreamble preamble = reader.readPreamble();
        if (preamble.contextKind() != 2 ||
            !MessageDigest.isEqual(preamble.contextId(), transferId)) {
            throw invalid("framed_sync_receipt_context_mismatch");
        }
        TransferReceipt receipt;
        try (FramedSyncWireFrame frame = reader.readFrame()) {
            if (frame == null || frame.header().frameType() != FramedSyncFrameType.TRANSFER_RECEIPT.wireValue() ||
                frame.header().sequence() != 0) {
                throw invalid("framed_sync_receipt_frame_required");
            }
            byte[] plaintext = FramedSyncFrameCrypto.decrypt(groupKey, preamble, frame, 0);
            FramedSyncValidatedMessage decoded = FramedSyncCodec.decode(
                plaintext, FramedSyncFrameType.TRANSFER_RECEIPT.wireValue());
            receipt = (TransferReceipt) decoded.payload().value();
        }
        try (FramedSyncWireFrame extra = reader.readFrame()) {
            if (extra != null ||
                !MessageDigest.isEqual(receipt.getTransferId().toByteArray(), transferId) ||
                !MessageDigest.isEqual(receipt.getContentId().toByteArray(), contentId) ||
                !receiverDeviceId.equals(receipt.getReceiverDeviceId()) ||
                !receiverLibraryEpoch.equals(receipt.getReceiverLibraryEpoch())) {
                throw invalid("framed_sync_receipt_identity_mismatch");
            }
        }
        return receipt;
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
