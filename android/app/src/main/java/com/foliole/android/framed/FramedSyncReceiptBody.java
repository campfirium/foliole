package com.foliole.android.framed;

import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Arrays;

/** The receipt slot stays borrowed through signing and synchronous HTTP consumption. */
public final class FramedSyncReceiptBody implements AutoCloseable {
    interface Encoder { byte[] encode() throws Exception; }
    private final FramedSyncPayloadBudget.Loan loan;
    private byte[] bytes;
    private final String sha256;

    private FramedSyncReceiptBody(FramedSyncPayloadBudget.Loan loan, byte[] bytes) throws Exception {
        int prefix = FramedSyncPreamble.BYTES + FramedSyncWireHeader.BYTES;
        if (bytes.length < prefix) throw new IllegalArgumentException("framed_sync_receipt_frame_required");
        var header = FramedSyncWireHeader.decode(Arrays.copyOfRange(bytes, FramedSyncPreamble.BYTES, prefix));
        if (header.frameType() != 6 || header.sequence() != 0 ||
            header.ciphertextBytes() > FramedSyncPayloadBudget.RECEIPT_BYTES || bytes.length != prefix + header.ciphertextBytes()) {
            throw new IllegalArgumentException("framed_sync_receipt_frame_limit_exceeded");
        }
        this.loan = loan;
        this.bytes = bytes;
        StringBuilder hash = new StringBuilder(64);
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) {
            hash.append(String.format("%02x", value & 255));
        }
        sha256 = hash.toString();
    }

    static FramedSyncReceiptBody create(FramedSyncPayloadBudget budget, Encoder encoder) throws Exception {
        var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.RECEIPT);
        try { return new FramedSyncReceiptBody(loan, encoder.encode()); }
        catch (Exception error) { loan.close(); throw error; }
    }

    public String sha256() { return sha256; }
    public int length() { return bytes.length; }
    public void replay(FramedSyncStreamWriter output) throws Exception { FramedSyncSessionWriter.replay(bytes, output); }
    public void copyTo(OutputStream output) throws Exception { output.write(bytes); output.flush(); }

    @Override public void close() { bytes = null; loan.close(); }
}
