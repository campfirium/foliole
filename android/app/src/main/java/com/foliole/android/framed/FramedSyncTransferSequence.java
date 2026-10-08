package com.foliole.android.framed;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.RandomAccessFile;

/** Read independent original transfer ranges from an already verified HTTP spool. */
public final class FramedSyncTransferSequence implements AutoCloseable {
    public static final int MAX_ITEMS = 128;
    public static final long MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
    private final File file;
    private final RandomAccessFile index;
    private long position;
    private long messageBytes;
    private int count;
    private boolean uncompressed = true;
    private RangeInput previous;
    private int firstKind;

    public FramedSyncTransferSequence(File file) throws IOException {
        this.file = file;
        index = new RandomAccessFile(file, "r");
    }

    public Unit next() throws Exception {
        if (previous != null && previous.remaining != 0) throw invalid("framed_sync_unit_unconsumed");
        if (previous != null) previous.close();
        if (position == index.length()) {
            if (count == 0) throw invalid("framed_sync_unit_truncated");
            return null;
        }
        if (count == MAX_ITEMS) throw invalid("framed_sync_batch_item_limit_exceeded");
        if (count > 0 && !uncompressed) throw invalid("framed_sync_batch_compression_invalid");
        if (count > 0 && messageBytes > MAX_MESSAGE_BYTES) {
            throw invalid("framed_sync_batch_message_limit_exceeded");
        }
        long start = position;
        long priorMessageBytes = messageBytes;
        index.seek(start);
        FramedSyncPreamble preamble = FramedSyncPreamble.decode(read(FramedSyncPreamble.BYTES));
        if (preamble.contextKind() != 2) throw invalid("transfer_preamble_required");
        if (count > 0 && preamble.compression() != 0) throw invalid("framed_sync_batch_compression_invalid");
        uncompressed &= preamble.compression() == 0;
        messageBytes += FramedSyncPreamble.BYTES;
        boolean receipt = scanFrames();
        position = index.getFilePointer();
        count++;
        previous = new RangeInput(file, start, position - start);
        return new Unit(preamble, receipt, previous, messageBytes - priorMessageBytes);
    }

    private boolean scanFrames() throws IOException {
        int frames = 0;
        boolean receipt;
        while (true) {
            FramedSyncWireHeader header = FramedSyncWireHeader.decode(read(FramedSyncWireHeader.BYTES));
            if (header.ciphertextBytes() < 16) throw invalid("frame_ciphertext_length_invalid");
            if (frames == 0) {
                int kind = header.frameType();
                if (kind != 2 && kind != 6) throw invalid("transfer_header_required");
                if (count == 0) firstKind = kind;
                else if (kind != firstKind) throw invalid("framed_sync_batch_unit_kind_mismatch");
            }
            receipt = header.frameType() == 6;
            if (receipt && frames != 0) throw invalid("receipt_frame_not_first");
            if (receipt && header.ciphertextBytes() > FramedSyncPayloadBudget.RECEIPT_BYTES) {
                throw invalid("framed_sync_receipt_frame_limit_exceeded");
            }
            if (++frames > FramedSyncTransferReader.MAX_TRANSFER_FRAMES) throw invalid("transfer_frame_limit_exceeded");
            messageBytes += header.ciphertextBytes() - 16;
            if (count > 0 && messageBytes > MAX_MESSAGE_BYTES) throw invalid("framed_sync_batch_message_limit_exceeded");
            long end = index.getFilePointer() + header.ciphertextBytes();
            if (end > index.length()) throw invalid("framed_sync_frame_truncated");
            index.seek(end);
            if (receipt || header.frameType() == 5) break;
        }
        return receipt;
    }

    private byte[] read(int length) throws IOException {
        if (index.length() - index.getFilePointer() < length) throw invalid("framed_sync_unit_truncated");
        byte[] bytes = new byte[length];
        index.readFully(bytes);
        return bytes;
    }

    @Override public void close() throws IOException {
        try { if (previous != null) previous.close(); }
        finally { index.close(); }
    }

    private static IllegalArgumentException invalid(String code) { return new IllegalArgumentException(code); }

    public static final class Unit implements AutoCloseable {
        private final FramedSyncPreamble preamble;
        private final boolean receipt;
        private final RangeInput input;
        private final long messageBytes;
        private Unit(FramedSyncPreamble preamble, boolean receipt, RangeInput input, long messageBytes) {
            this.preamble = preamble;
            this.receipt = receipt;
            this.input = input;
            this.messageBytes = messageBytes;
        }
        public FramedSyncPreamble preamble() { return preamble; }
        public boolean isReceipt() { return receipt; }
        public InputStream input() { return input; }
        public long messageBytes() { return messageBytes; }
        @Override public void close() throws IOException { input.close(); }
    }

    private static final class RangeInput extends InputStream {
        private final FileInputStream file;
        private long remaining;
        RangeInput(File source, long offset, long length) throws IOException {
            file = new FileInputStream(source);
            file.getChannel().position(offset);
            remaining = length;
        }
        @Override public int read() throws IOException {
            if (remaining == 0) return -1;
            int result = file.read();
            if (result < 0) throw new IOException("framed_sync_frame_truncated");
            remaining--;
            return result;
        }
        @Override public int read(byte[] bytes, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining == 0) return -1;
            int count = file.read(bytes, offset, (int) Math.min(remaining, length));
            if (count < 0) throw new IOException("framed_sync_frame_truncated");
            remaining -= count;
            return count;
        }
        @Override public void close() throws IOException { file.close(); }
    }
}
