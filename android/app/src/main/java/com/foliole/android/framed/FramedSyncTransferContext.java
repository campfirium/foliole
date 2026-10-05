package com.foliole.android.framed;

import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferProposal;
import java.security.MessageDigest;

public final class FramedSyncTransferContext {
    private final String groupId;
    private final String receiverDeviceId;
    private final String receiverLibraryEpoch;
    private final String senderDeviceId;
    private final String senderLibraryEpoch;

    public FramedSyncTransferContext(
        String groupId,
        String senderDeviceId,
        String senderLibraryEpoch,
        String receiverDeviceId,
        String receiverLibraryEpoch
    ) {
        this.groupId = required(groupId);
        this.senderDeviceId = required(senderDeviceId);
        this.senderLibraryEpoch = required(senderLibraryEpoch);
        this.receiverDeviceId = required(receiverDeviceId);
        this.receiverLibraryEpoch = required(receiverLibraryEpoch);
    }

    TransferProposal proposal(FramedSyncPreamble preamble, TransferHeader header)
        throws FramedSyncValidationException {
        validate();
        if (preamble.contextKind() != 2) throw invalid("transfer_preamble_required");
        if (preamble.startingSequence() != 0) throw invalid("transfer_starting_sequence_invalid");
        byte[] transferId = preamble.contextId();
        byte[] contentId = header.getManifest().getContentId().toByteArray();
        if (!groupId.equals(header.getManifest().getGroupId()) ||
            !MessageDigest.isEqual(preamble.identifier(), header.getAttemptId().toByteArray()) ||
            !MessageDigest.isEqual(transferId, header.getTransferId().toByteArray()) ||
            !MessageDigest.isEqual(
                transferId, FramedSyncCanonicalManifest.transferId(this, contentId))) {
            throw invalid("inbound_transfer_identity_mismatch");
        }
        long totalBlobBytes = 0;
        for (var blob : header.getManifest().getBlobsList()) {
            long next = totalBlobBytes + blob.getByteLength();
            if (Long.compareUnsigned(next, totalBlobBytes) < 0) {
                throw invalid("transfer_blob_total_invalid");
            }
            totalBlobBytes = next;
        }
        if (Long.compareUnsigned(totalBlobBytes, FramedSyncContract.MAX_TRANSFER_BYTES) > 0) {
            throw invalid("transfer_blob_total_invalid");
        }
        return TransferProposal.newBuilder()
            .setTransferId(header.getTransferId()).setContentId(header.getManifest().getContentId())
            .setFactCount(header.getManifest().getFactsCount())
            .setBlobCount(header.getManifest().getBlobsCount()).setTotalBlobBytes(totalBlobBytes)
            .setSenderDeviceId(senderDeviceId).setSenderLibraryEpoch(senderLibraryEpoch)
            .setReceiverDeviceId(receiverDeviceId).setReceiverLibraryEpoch(receiverLibraryEpoch)
            .build();
    }

    String groupId() { return groupId; }
    String receiverDeviceId() { return receiverDeviceId; }
    String receiverLibraryEpoch() { return receiverLibraryEpoch; }
    public String senderDeviceId() { return senderDeviceId; }
    public String senderLibraryEpoch() { return senderLibraryEpoch; }

    private void validate() throws FramedSyncValidationException {
        FramedSyncValueValidator.text(groupId, "group_id");
        FramedSyncValueValidator.text(senderDeviceId, "sender_device_id");
        FramedSyncValueValidator.text(senderLibraryEpoch, "sender_library_epoch");
        FramedSyncValueValidator.text(receiverDeviceId, "receiver_device_id");
        FramedSyncValueValidator.text(receiverLibraryEpoch, "receiver_library_epoch");
    }

    private static String required(String value) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("transfer_context_invalid");
        return value;
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
