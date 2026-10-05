package com.foliole.android.framed;

import java.util.List;

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

    List<FramedSyncAuthenticatedFrame> loadReplayableOutboundFrames(
        byte[] transferId,
        byte[] attemptId
    ) throws Exception;
}
