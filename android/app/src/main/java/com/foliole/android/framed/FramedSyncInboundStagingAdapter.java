package com.foliole.android.framed;

public final class FramedSyncInboundStagingAdapter {
    private final FramedSyncDurableStaging staging;

    public FramedSyncInboundStagingAdapter(FramedSyncDurableStaging staging) {
        if (staging == null) throw new NullPointerException("staging");
        this.staging = staging;
    }

    public FramedSyncStageOutcome commitAuthenticatedFrame(
        FramedSyncAuthenticatedFrame frame
    ) throws Exception {
        FramedSyncPreamble.decode(frame.preamble());
        FramedSyncWireHeader header = FramedSyncWireHeader.decode(frame.frameHeader());
        if (header.ciphertextBytes() != frame.ciphertext().length) {
            throw new FramedSyncValidationException("framed_sync_frame_body_length_mismatch");
        }
        FramedSyncValidatedMessage validated = FramedSyncCodec.decode(
            frame.plaintext(), header.frameType());
        FramedSyncTransferBinding.require(validated.payload(), frame);
        return staging.commitInboundFrame(frame, validated);
    }
}
