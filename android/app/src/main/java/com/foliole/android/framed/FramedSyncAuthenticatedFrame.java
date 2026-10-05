package com.foliole.android.framed;

public final class FramedSyncAuthenticatedFrame {
    private final byte[] transferId;
    private final byte[] attemptId;
    private final byte[] preamble;
    private final byte[] frameHeader;
    private final byte[] ciphertext;
    private final byte[] plaintext;

    public FramedSyncAuthenticatedFrame(
        byte[] transferId,
        byte[] attemptId,
        byte[] preamble,
        byte[] frameHeader,
        byte[] ciphertext,
        byte[] plaintext
    ) {
        this.transferId = copy(transferId, "transferId");
        this.attemptId = copy(attemptId, "attemptId");
        this.preamble = copy(preamble, "preamble");
        this.frameHeader = copy(frameHeader, "frameHeader");
        this.ciphertext = copy(ciphertext, "ciphertext");
        this.plaintext = copy(plaintext, "plaintext");
    }

    public byte[] transferId() { return transferId.clone(); }
    public byte[] attemptId() { return attemptId.clone(); }
    public byte[] preamble() { return preamble.clone(); }
    public byte[] frameHeader() { return frameHeader.clone(); }
    public byte[] ciphertext() { return ciphertext.clone(); }
    public byte[] plaintext() { return plaintext.clone(); }

    private static byte[] copy(byte[] value, String name) {
        if (value == null) throw new NullPointerException(name);
        return value.clone();
    }
}
