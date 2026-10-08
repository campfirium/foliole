package com.foliole.android.framed;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.DigestOutputStream;
import java.security.MessageDigest;

/** One request owns the immutable signed file and deletes it when HTTP consumption ends. */
public final class FramedSyncSessionFile implements AutoCloseable {
    private final File file;
    private final String sha256;
    private final FramedSyncPayloadBudget budget;

    private FramedSyncSessionFile(File file, byte[] digest, FramedSyncPayloadBudget budget) {
        this.file = file;
        this.budget = budget;
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest) hex.append(String.format("%02x", value & 255));
        this.sha256 = hex.toString();
    }

    public static FramedSyncSessionFile create(File directory, byte[] groupKey,
        FramedSyncSessionContext context, FramedSyncSessionWriter.MessageSource messages,
        FramedSyncSessionNonceStore nonces) throws Exception {
        return create(directory, groupKey, context, messages, nonces, null);
    }

    public static FramedSyncSessionFile create(File directory, byte[] groupKey,
        FramedSyncSessionContext context, FramedSyncSessionWriter.MessageSource messages,
        FramedSyncSessionNonceStore nonces, FramedSyncPayloadBudget budget) throws Exception {
        File file = File.createTempFile("framed-session-", ".body", directory);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (DigestOutputStream output = new DigestOutputStream(new FileOutputStream(file), digest)) {
                FramedSyncSessionWriter.write(groupKey, context, messages, nonces, output, budget);
            }
            return new FramedSyncSessionFile(file, digest.digest(), budget);
        } catch (Exception error) {
            file.delete();
            throw error;
        }
    }

    public String sha256() { return sha256; }
    public long length() { return file.length(); }

    public void replay(FramedSyncStreamWriter output) throws Exception {
        try (FileInputStream source = new FileInputStream(file)) {
            FramedSyncStreamReader input = new FramedSyncStreamReader(source);
            if (budget != null) input.budgeted(budget, FramedSyncPayloadBudget.Direction.OUTBOUND,
                FramedSyncPayloadBudget.Lane.PAYLOAD);
            output.writePreamble(input.readPreamble().encoded());
            for (FramedSyncWireFrame frame = input.readFrame(); frame != null; frame = input.readFrame()) {
                try (var consumed = frame) {
                    output.writeFrame(frame.headerBytes(), frame.borrowedCiphertext());
                }
            }
            output.flush();
        }
    }

    public void copyTo(java.io.OutputStream output) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            while (true) {
                try (var loan = FramedSyncPayloadBudget.borrow(budget,
                    FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
                    byte[] buffer = new byte[64 * 1024];
                    int count = input.read(buffer);
                    if (count < 0) break;
                    output.write(buffer, 0, count);
                }
            }
        }
        output.flush();
    }

    @Override public void close() throws java.io.IOException {
        if (file.exists() && !file.delete()) throw new java.io.IOException("framed_sync_session_cleanup_failed");
    }
}
