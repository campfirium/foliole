package com.foliole.android.framed;

public final class FramedSyncWireFrame {
    private final byte[] ciphertext;
    private final byte[] headerBytes;
    private final FramedSyncWireHeader header;

    FramedSyncWireFrame(byte[] headerBytes, FramedSyncWireHeader header, byte[] ciphertext) {
        this.headerBytes = headerBytes.clone();
        this.header = header;
        this.ciphertext = ciphertext.clone();
    }

    public byte[] ciphertext() { return ciphertext.clone(); }
    public FramedSyncWireHeader header() { return header; }
    public byte[] headerBytes() { return headerBytes.clone(); }
}
