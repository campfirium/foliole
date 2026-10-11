package com.foliole.android.framed;

import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import java.io.File;
import java.util.Arrays;
import java.util.List;

final class FramedSyncFileStaging implements FramedSyncDurableStaging {
    private final FramedSyncFileInbound inbound;
    private final FramedSyncFileReceipts receipts;

    FramedSyncFileStaging(FramedSyncFiles files, File resources, FramedSyncTransferContext context) {
        inbound = new FramedSyncFileInbound(files, resources, context);
        receipts = new FramedSyncFileReceipts(files);
    }

    @Override public FramedSyncStageOutcome admitInboundTransfer(TransferProposal proposal) throws Exception {
        return inbound.admit(proposal);
    }

    @Override public FramedSyncStageOutcome commitInboundFrame(FramedSyncAuthenticatedFrame frame,
        FramedSyncValidatedMessage message) throws Exception {
        if (!Arrays.equals(FramedSyncCodec.encode(message), frame.borrowedPlaintext())) {
            throw new FramedSyncValidationException("framed_sync_stage_plaintext_mismatch");
        }
        if (message.wireMessage().hasTransferReceipt()) return receipts.frame(frame, message.wireMessage().getTransferReceipt());
        return inbound.commit(frame, message);
    }

    @Override public void invalidateInboundAttempt(byte[] transfer, byte[] attempt) throws Exception { inbound.invalidate(transfer, attempt); }
    void releaseRetainedRetry() throws Exception { inbound.releaseRetainedRetry(); }
    @Override public FramedSyncStageOutcome commitReceipt(TransferReceipt receipt) throws Exception { return receipts.commit(receipt); }
    @Override public FramedSyncStageOutcome prepareReceiptAttempt(byte[] transfer, byte[] attempt, byte[] preamble) throws Exception {
        return receipts.prepare(transfer, attempt, preamble);
    }
    @Override public FramedSyncStageOutcome finalizeReceiptAttempt(byte[] transfer, byte[] attempt) throws Exception {
        return receipts.finalizeAttempt(transfer, attempt);
    }
    @Override public List<FramedSyncAuthenticatedFrame> loadReplayableReceiptFrames(byte[] transfer, byte[] attempt) throws Exception {
        return receipts.load(transfer, attempt);
    }
}
