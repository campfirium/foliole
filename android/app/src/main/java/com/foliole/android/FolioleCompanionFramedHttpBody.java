package com.foliole.android;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPreamble;
import com.foliole.android.framed.FramedSyncWireHeader;

/** Owns the raw HTTP body until verified frames have been copied to durable staging. */
final class FolioleCompanionFramedHttpBody implements AutoCloseable {
    final File file;
    final long byteLength;
    final String sha256;

    private FolioleCompanionFramedHttpBody(File file, long byteLength, String sha256) {
        this.file = file; this.byteLength = byteLength; this.sha256 = sha256;
    }

    static FolioleCompanionFramedHttpBody spool(InputStream input, File directory, String expected) throws Exception {
        return spool(input, directory, expected, null);
    }

    static FolioleCompanionFramedHttpBody spool(InputStream input, File directory, String expected,
        FramedSyncPayloadBudget budget) throws Exception {
        if (expected == null || !expected.matches("^[0-9a-f]{64}$")) throw new SecurityException("invalid_signature");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("http_body_directory_unavailable");
        File file = File.createTempFile("foliole-framed-http-", ".body", directory);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long size = copy(input, file, digest, budget);
            String actual = hex(digest.digest());
            if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII))) {
                throw new SecurityException("invalid_signature");
            }
            return new FolioleCompanionFramedHttpBody(file, size, actual);
        } catch (Exception error) {
            if (!file.delete()) error.addSuppressed(new IOException("http_body_cleanup_failed"));
            throw error;
        }
    }

    private static long copy(InputStream input, File file, MessageDigest digest, FramedSyncPayloadBudget budget)
        throws Exception {
        if (budget == null) return copyUnmanaged(input, file, digest);
        byte[] prefix = new byte[FramedSyncPreamble.BYTES + FramedSyncWireHeader.BYTES];
        for (int offset = 0; offset < prefix.length;) {
            int count = input.read(prefix, offset, prefix.length - offset);
            if (count < 1) throw new IOException("http_body_read_failed");
            offset += count;
        }
        var header = FramedSyncWireHeader.decode(java.util.Arrays.copyOfRange(prefix,
            FramedSyncPreamble.BYTES, prefix.length));
        var lane = header.frameType() == 6 ? FramedSyncPayloadBudget.Lane.RECEIPT : FramedSyncPayloadBudget.Lane.PAYLOAD;
        if (lane == FramedSyncPayloadBudget.Lane.RECEIPT && header.ciphertextBytes() > FramedSyncPayloadBudget.RECEIPT_BYTES) {
            throw new IllegalArgumentException("framed_sync_receipt_frame_limit_exceeded");
        }
        long size = prefix.length;
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(prefix);
            digest.update(prefix);
            while (true) {
                try (var loan = budget == null ? null : budget.acquire(FramedSyncPayloadBudget.Direction.INBOUND, lane)) {
                    byte[] buffer = new byte[64 * 1024];
                    int count = input.read(buffer);
                    if (count < 0) break;
                    if (count == 0) throw new IOException("http_body_read_failed");
                    size += count;
                    if (lane == FramedSyncPayloadBudget.Lane.RECEIPT && size >
                        com.foliole.android.framed.FramedSyncTransferSequence.MAX_MESSAGE_BYTES +
                        (long) com.foliole.android.framed.FramedSyncTransferSequence.MAX_ITEMS * (FramedSyncWireHeader.BYTES + 16)) {
                        throw new IllegalArgumentException("framed_sync_batch_message_limit_exceeded");
                    }
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                }
            }
        }
        return size;
    }

    private static long copyUnmanaged(InputStream input, File file, MessageDigest digest) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long size = 0;
        try (FileOutputStream output = new FileOutputStream(file)) {
            for (int count; (count = input.read(buffer)) >= 0;) {
                if (count == 0) throw new IOException("http_body_read_failed");
                output.write(buffer, 0, count);
                digest.update(buffer, 0, count);
                size += count;
            }
        }
        return size;
    }

    InputStream open() throws IOException { return new FileInputStream(file); }

    @Override public void close() throws IOException {
        if (file.exists() && !file.delete()) throw new IOException("http_body_cleanup_failed");
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", Byte.toUnsignedInt(value)));
        return result.toString();
    }
}
