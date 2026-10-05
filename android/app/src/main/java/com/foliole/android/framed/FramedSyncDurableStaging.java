package com.foliole.android.framed;

import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import java.util.List;

public interface FramedSyncDurableStaging {
    FramedSyncStageOutcome admitInboundTransfer(TransferProposal proposal) throws Exception;

    FramedSyncStageOutcome commitInboundFrame(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncValidatedMessage message
    ) throws Exception;

    void invalidateInboundAttempt(byte[] transferId, byte[] attemptId) throws Exception;

    FramedSyncStageOutcome commitReceipt(TransferReceipt receipt) throws Exception;

    FramedSyncStageOutcome prepareReceiptAttempt(
        byte[] transferId,
        byte[] attemptId,
        byte[] preamble
    ) throws Exception;

    FramedSyncStageOutcome finalizeReceiptAttempt(byte[] transferId, byte[] attemptId)
        throws Exception;

    List<FramedSyncAuthenticatedFrame> loadReplayableReceiptFrames(
        byte[] transferId,
        byte[] attemptId
    ) throws Exception;
}
