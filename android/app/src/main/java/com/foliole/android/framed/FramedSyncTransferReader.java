package com.foliole.android.framed;

import com.foliole.sync.v22.TransferHeader;
import java.io.InputStream;

public final class FramedSyncTransferReader {
    public static final int MAX_TRANSFER_FRAMES =
        (int) (FramedSyncContract.MAX_TRANSFER_BYTES / FramedSyncContract.BLOB_CHUNK_BYTES) +
            FramedSyncContract.MAX_FACTS_PER_TRANSFER + 2;

    public interface HeaderGuard { void accept(TransferHeader header) throws Exception; }

    private FramedSyncTransferReader() {}

    public static Result receive(
        InputStream input,
        byte[] groupKey,
        FramedSyncTransferContext context,
        FramedSyncDurableStaging staging
    ) throws Exception {
        return receive(new FramedSyncStreamReader(input), groupKey, context, staging);
    }

    public static Result receive(InputStream input, byte[] groupKey, FramedSyncTransferContext context,
        FramedSyncDurableStaging staging, FramedSyncPayloadBudget budget) throws Exception {
        return receive(new FramedSyncStreamReader(input).budgeted(budget,
            FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD),
            groupKey, context, staging);
    }

    public static Result receive(InputStream input, byte[] groupKey, FramedSyncTransferContext context,
        FramedSyncDurableStaging staging, FramedSyncPayloadBudget budget, HeaderGuard guard) throws Exception {
        return receive(new FramedSyncStreamReader(input).budgeted(budget,
            FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD),
            groupKey, context, staging, guard);
    }

    private static Result receive(FramedSyncStreamReader stream, byte[] groupKey,
        FramedSyncTransferContext context, FramedSyncDurableStaging staging) throws Exception {
        return receive(stream, groupKey, context, staging, header -> {});
    }

    private static Result receive(FramedSyncStreamReader stream, byte[] groupKey,
        FramedSyncTransferContext context, FramedSyncDurableStaging staging, HeaderGuard guard) throws Exception {
        FramedSyncPreamble preamble = stream.readPreamble();
        if (preamble.contextKind() != 2) throw invalid("transfer_preamble_required");
        if (preamble.startingSequence() != 0) throw invalid("transfer_starting_sequence_invalid");
        byte[] transferId = preamble.contextId();
        byte[] attemptId = preamble.identifier();
        FramedSyncInboundStagingAdapter adapter = new FramedSyncInboundStagingAdapter(staging);
        boolean admitted = false;
        boolean trailerSeen = false;
        long sequence = 0;
        try {
            for (FramedSyncWireFrame wire = stream.readFrame(); wire != null; wire = stream.readFrame()) {
                try (var consumed = wire) {
                    if (sequence >= MAX_TRANSFER_FRAMES) throw invalid("transfer_frame_limit_exceeded");
                    if (trailerSeen) throw invalid("transfer_trailer_not_final");
                    byte[] plaintext = FramedSyncFrameCrypto.decrypt(groupKey, preamble, wire, sequence);
                    FramedSyncValidatedMessage message = FramedSyncCodec.decode(
                        plaintext, wire.header().frameType());
                    if (sequence == 0) {
                        if (message.payload().payloadCase() != FramedSyncPayload.Case.TRANSFER_HEADER) {
                            throw invalid("transfer_header_required");
                        }
                        guard.accept((TransferHeader) message.payload().value());
                        staging.admitInboundTransfer(context.proposal(
                            preamble, (TransferHeader) message.payload().value()));
                        admitted = true;
                    } else if (message.payload().payloadCase() == FramedSyncPayload.Case.TRANSFER_HEADER) {
                        throw invalid("transfer_header_repeated");
                    }
                    FramedSyncAuthenticatedFrame frame = new FramedSyncAuthenticatedFrame(
                        transferId, attemptId, preamble.encoded(), wire.headerBytes(),
                        wire.borrowedCiphertext(), plaintext);
                    adapter.commitAuthenticatedFrame(frame);
                    trailerSeen = message.payload().payloadCase() == FramedSyncPayload.Case.TRANSFER_TRAILER;
                    sequence += 1;
                }
            }
            if (!trailerSeen) throw FramedSyncStreamReader.interrupted("transfer_trailer_missing");
            return new Result(transferId, attemptId);
        } catch (Exception error) {
            if (admitted && !FramedSyncStreamReader.isTransportInterruption(error)) {
                staging.invalidateInboundAttempt(transferId, attemptId);
            }
            throw error;
        }
    }

    public static final class Result {
        private final byte[] attemptId;
        private final byte[] transferId;

        Result(byte[] transferId, byte[] attemptId) {
            this.transferId = transferId.clone(); this.attemptId = attemptId.clone();
        }

        public byte[] attemptId() { return attemptId.clone(); }
        public byte[] transferId() { return transferId.clone(); }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
