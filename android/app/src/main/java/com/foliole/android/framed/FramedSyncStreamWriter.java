package com.foliole.android.framed;

import java.io.OutputStream;

public final class FramedSyncStreamWriter {
    private final OutputStream output;
    private boolean preambleWritten;

    public FramedSyncStreamWriter(OutputStream output) {
        if (output == null) throw new NullPointerException("output");
        this.output = output;
    }

    public void writePreamble(byte[] encoded) throws Exception {
        if (preambleWritten) throw new IllegalStateException("framed_sync_preamble_already_written");
        FramedSyncPreamble.decode(encoded);
        output.write(encoded);
        preambleWritten = true;
    }

    public void writeFrame(byte[] headerBytes, byte[] ciphertext) throws Exception {
        if (!preambleWritten) throw new IllegalStateException("framed_sync_preamble_required");
        FramedSyncWireHeader header = FramedSyncWireHeader.decode(headerBytes);
        if (ciphertext.length != header.ciphertextBytes()) {
            throw new IllegalArgumentException("framed_sync_frame_body_length_mismatch");
        }
        output.write(headerBytes);
        output.write(ciphertext);
    }

    public void flush() throws Exception { output.flush(); }
}
