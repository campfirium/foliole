package com.foliole.android.framed;

public interface FramedSyncOutboundStaging {
    FramedSyncStageOutcome prepareOutboundAttempt(
        byte[] transferId,
        byte[] attemptId,
        byte[] preamble
    ) throws Exception;

    FramedSyncStageOutcome commitOutboundFrame(FramedSyncAuthenticatedFrame frame)
        throws Exception;

    FramedSyncStageOutcome finalizeOutboundAttempt(byte[] transferId, byte[] attemptId)
        throws Exception;

    void replayOutboundFrames(
        byte[] transferId,
        byte[] attemptId,
        FramedSyncStreamWriter writer
    ) throws Exception;
}
