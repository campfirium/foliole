package com.foliole.android.framed;

import java.io.IOException;
import java.io.InputStream;

public final class FramedSyncStreamReader {
    static final class TransportInterruption extends IllegalArgumentException {
        TransportInterruption(String code) { super(code); }
    }

    private final InputStream input;
    private boolean preambleRead;
    private FramedSyncPayloadBudget budget;
    private FramedSyncPayloadBudget.Direction direction = FramedSyncPayloadBudget.Direction.INBOUND;
    private FramedSyncPayloadBudget.Lane lane = FramedSyncPayloadBudget.Lane.PAYLOAD;

    public FramedSyncStreamReader(InputStream input) {
        if (input == null) throw new NullPointerException("input");
        this.input = input;
    }

    public FramedSyncStreamReader budgeted(FramedSyncPayloadBudget owner,
        FramedSyncPayloadBudget.Direction direction, FramedSyncPayloadBudget.Lane lane) {
        if (preambleRead || budget != null || owner == null) throw new IllegalStateException("framed_sync_reader_owner_invalid");
        this.budget = owner;
        this.direction = direction;
        this.lane = lane;
        return this;
    }

    public FramedSyncPreamble readPreamble() throws Exception {
        if (preambleRead) throw new IllegalStateException("framed_sync_preamble_already_read");
        byte[] encoded = readExact(FramedSyncPreamble.BYTES, "framed_sync_preamble_truncated", false);
        preambleRead = true;
        return FramedSyncPreamble.decode(encoded);
    }

    public FramedSyncWireFrame readFrame() throws Exception {
        if (!preambleRead) throw new IllegalStateException("framed_sync_preamble_required");
        byte[] headerBytes = readExact(
            FramedSyncWireHeader.BYTES, "framed_sync_frame_header_truncated", true);
        if (headerBytes == null) return null;
        FramedSyncWireHeader header = FramedSyncWireHeader.decode(headerBytes);
        if (lane == FramedSyncPayloadBudget.Lane.RECEIPT &&
            (header.ciphertextBytes() > FramedSyncPayloadBudget.RECEIPT_BYTES ||
                header.frameType() != FramedSyncFrameType.TRANSFER_RECEIPT.wireValue())) {
            throw new IllegalArgumentException("framed_sync_receipt_frame_limit_exceeded");
        }
        var loan = FramedSyncPayloadBudget.borrow(budget, direction, lane);
        try {
            byte[] ciphertext = readExact(
                header.ciphertextBytes(), "framed_sync_frame_body_truncated", false);
            return new FramedSyncWireFrame(headerBytes, header, ciphertext, loan);
        } catch (Exception error) {
            if (loan != null) loan.close();
            throw error;
        }
    }

    static TransportInterruption interrupted(String code) {
        return new TransportInterruption(code);
    }

    static boolean isTransportInterruption(Exception error) {
        return error instanceof IOException || error instanceof TransportInterruption;
    }

    private byte[] readExact(int length, String truncatedError, boolean allowCleanEnd)
        throws Exception {
        byte[] result = new byte[length];
        int offset = 0;
        while (offset < length) {
            int count = input.read(result, offset, length - offset);
            if (count < 0) {
                if (allowCleanEnd && offset == 0) return null;
                throw interrupted(truncatedError);
            }
            if (count == 0) {
                int value = input.read();
                if (value < 0) throw interrupted(truncatedError);
                result[offset++] = (byte) value;
            } else {
                offset += count;
            }
        }
        return result;
    }
}
