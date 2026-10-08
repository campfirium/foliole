package com.foliole.android.framed;

public final class FramedSyncWireFrame implements AutoCloseable {
    private final byte[] ciphertext;
    private final byte[] headerBytes;
    private final FramedSyncWireHeader header;
    private final FramedSyncPayloadBudget.Loan loan;

    FramedSyncWireFrame(byte[] headerBytes, FramedSyncWireHeader header, byte[] ciphertext) {
        this(headerBytes, header, ciphertext, null);
    }

    FramedSyncWireFrame(byte[] headerBytes, FramedSyncWireHeader header, byte[] ciphertext,
        FramedSyncPayloadBudget.Loan loan) {
        this.headerBytes = headerBytes.clone();
        this.header = header;
        this.ciphertext = ciphertext.clone();
        this.loan = loan;
    }

    public byte[] ciphertext() { return ciphertext.clone(); }
    // Internal consumers may read these bytes but must not mutate or expose them.
    byte[] borrowedCiphertext() { return ciphertext; }
    public FramedSyncWireHeader header() { return header; }
    public byte[] headerBytes() { return headerBytes.clone(); }
    @Override public void close() { if (loan != null) loan.close(); }
}
