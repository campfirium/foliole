package com.foliole.android.framed;

import java.io.InputStream;
import java.io.IOException;

/** Bound each original transfer at its trailer without consuming the next preamble. */
public final class FramedSyncTransferSequenceStream {
    private final InputStream input;
    private int count;
    private long messageBytes;
    private boolean uncompressed = true;
    private Unit previous;

    public FramedSyncTransferSequenceStream(InputStream input) { this.input = input; }

    public interface Consumer { void accept(InputStream unit, int index) throws Exception; }

    public static int read(InputStream input, int expectedCount, Consumer consumer) throws Exception {
        if (expectedCount < 1 || expectedCount > FramedSyncTransferSequence.MAX_ITEMS) {
            throw invalid("framed_sync_batch_item_limit_exceeded");
        }
        var sequence = new FramedSyncTransferSequenceStream(input);
        int received = 0;
        for (InputStream unit = sequence.next(); unit != null; unit = sequence.next()) {
            if (received == expectedCount) throw invalid("framed_sync_batch_response_unexpected");
            consumer.accept(unit, received++);
        }
        return received;
    }

    public InputStream next() throws Exception {
        if (previous != null && !previous.done) throw invalid("framed_sync_unit_unconsumed");
        int first = input.read();
        if (first < 0) {
            if (count == 0) throw invalid("framed_sync_unit_truncated");
            return null;
        }
        if (count == FramedSyncTransferSequence.MAX_ITEMS) throw invalid("framed_sync_batch_item_limit_exceeded");
        byte[] bytes = new byte[FramedSyncPreamble.BYTES];
        bytes[0] = (byte) first;
        readExact(bytes, 1);
        var preamble = FramedSyncPreamble.decode(bytes);
        if (preamble.contextKind() != 2) throw invalid("transfer_preamble_required");
        if (count > 0 && (!uncompressed || preamble.compression() != 0)) throw invalid("framed_sync_batch_compression_invalid");
        uncompressed &= preamble.compression() == 0;
        messageBytes += bytes.length;
        count++;
        requireBudget();
        previous = new Unit(bytes);
        return previous;
    }

    private void requireBudget() {
        if (count > 1 && messageBytes > FramedSyncTransferSequence.MAX_MESSAGE_BYTES) {
            throw invalid("framed_sync_batch_message_limit_exceeded");
        }
    }

    private void readExact(byte[] bytes, int offset) throws IOException {
        while (offset < bytes.length) {
            int size = input.read(bytes, offset, bytes.length - offset);
            if (size < 1) throw new IOException("framed_sync_frame_truncated");
            offset += size;
        }
    }

    private static IllegalArgumentException invalid(String code) { return new IllegalArgumentException(code); }

    private final class Unit extends InputStream {
        private byte[] prefix;
        private int offset;
        private int remaining;
        private int frames;
        private boolean terminal;
        private boolean done;
        Unit(byte[] preamble) { prefix = preamble; }

        private boolean advance() throws IOException {
            if (offset < prefix.length || remaining > 0) return true;
            if (terminal) { done = true; return false; }
            prefix = new byte[FramedSyncWireHeader.BYTES];
            offset = 0;
            readExact(prefix, 0);
            var header = FramedSyncWireHeader.decode(prefix);
            if (frames == 0 && header.frameType() != 2) throw invalid("transfer_header_required");
            if (header.frameType() == 6) throw invalid("framed_sync_batch_unit_kind_mismatch");
            if (++frames > FramedSyncTransferReader.MAX_TRANSFER_FRAMES) throw invalid("transfer_frame_limit_exceeded");
            if (header.ciphertextBytes() < 16) throw invalid("frame_ciphertext_length_invalid");
            messageBytes += header.ciphertextBytes() - 16;
            requireBudget();
            remaining = header.ciphertextBytes();
            terminal = header.frameType() == 5;
            return true;
        }

        @Override public int read() throws IOException {
            byte[] one = new byte[1];
            return read(one, 0, 1) < 0 ? -1 : Byte.toUnsignedInt(one[0]);
        }

        @Override public int read(byte[] bytes, int start, int length) throws IOException {
            if (length == 0) return 0;
            if (!advance()) return -1;
            if (offset < prefix.length) {
                int size = Math.min(length, prefix.length - offset);
                System.arraycopy(prefix, offset, bytes, start, size);
                offset += size;
                return size;
            }
            int size = input.read(bytes, start, Math.min(length, remaining));
            if (size < 1) throw new IOException("framed_sync_frame_truncated");
            remaining -= size;
            return size;
        }

        @Override public void close() {} // The HTTP owner retains the underlying connection.
    }
}
