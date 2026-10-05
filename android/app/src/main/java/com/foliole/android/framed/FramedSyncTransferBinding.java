package com.foliole.android.framed;

import com.google.protobuf.ByteString;

final class FramedSyncTransferBinding {
    private FramedSyncTransferBinding() {}

    static void require(FramedSyncPayload payload, FramedSyncAuthenticatedFrame frame)
        throws FramedSyncValidationException {
        ByteString transferId;
        switch (payload.payloadCase()) {
            case TRANSFER_HEADER:
                var header = (com.foliole.sync.v22.TransferHeader) payload.value();
                if (!header.getAttemptId().equals(ByteString.copyFrom(frame.attemptId()))) {
                    throw invalid("attempt_identity_mismatch");
                }
                transferId = header.getTransferId();
                break;
            case BLOB_CHUNK:
                transferId = ((com.foliole.sync.v22.BlobChunk) payload.value()).getTransferId();
                break;
            case TRANSFER_TRAILER:
                transferId = ((com.foliole.sync.v22.TransferTrailer) payload.value()).getTransferId();
                break;
            case TRANSFER_RECEIPT:
                transferId = ((com.foliole.sync.v22.TransferReceipt) payload.value()).getTransferId();
                break;
            case FACT:
                return;
            default:
                throw invalid("transfer_frame_payload_required");
        }
        if (!transferId.equals(ByteString.copyFrom(frame.transferId()))) {
            throw invalid("transfer_identity_mismatch");
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
