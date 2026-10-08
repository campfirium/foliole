package com.foliole.android.framed;

import com.foliole.sync.v22.TransferReceipt;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;

/** Commit each original authenticated receipt before reading the following independent unit. */
public final class FramedSyncReceiptSequenceReader {
    public interface Consumer { void accept(TransferReceipt receipt) throws Exception; }
    public static final class Expected {
        final byte[] transferId;
        final byte[] contentId;
        public Expected(byte[] transferId, byte[] contentId) {
            this.transferId = transferId.clone();
            this.contentId = contentId.clone();
        }
    }
    private FramedSyncReceiptSequenceReader() {}

    public static void read(InputStream input, byte[] key, String receiver, String epoch,
        List<Expected> expected, FramedSyncPayloadBudget budget, Consumer consumer) throws Exception {
        var pending = new LinkedHashMap<ByteString, Expected>();
        if (expected.isEmpty() || expected.size() > FramedSyncTransferSequence.MAX_ITEMS) throw invalid("framed_sync_batch_item_limit_exceeded");
        for (var item : expected) if (pending.put(ByteString.copyFrom(item.transferId), item) != null) throw invalid("framed_sync_batch_duplicate_transfer");
        int count = 0;
        long messageBytes = 0;
        boolean uncompressed = true;
        for (int first = input.read(); first >= 0; first = input.read()) {
            if (count == FramedSyncTransferSequence.MAX_ITEMS) throw invalid("framed_sync_batch_item_limit_exceeded");
            byte[] prefix = prefix(input, first);
            var preamble = FramedSyncPreamble.decode(java.util.Arrays.copyOf(prefix, FramedSyncPreamble.BYTES));
            var header = FramedSyncWireHeader.decode(java.util.Arrays.copyOfRange(prefix, FramedSyncPreamble.BYTES, prefix.length));
            requireReceipt(header);
            if (count > 0 && (!uncompressed || preamble.compression() != 0)) throw invalid("framed_sync_batch_compression_invalid");
            uncompressed &= preamble.compression() == 0;
            messageBytes += FramedSyncPreamble.BYTES + header.ciphertextBytes() - 16;
            if (count > 0 && messageBytes > FramedSyncTransferSequence.MAX_MESSAGE_BYTES) throw invalid("framed_sync_batch_message_limit_exceeded");
            var item = pending.get(ByteString.copyFrom(preamble.contextId()));
            if (item == null) throw invalid("framed_sync_batch_receipt_unexpected");
            var unit = new SequenceInputStream(new ByteArrayInputStream(prefix), new BodyRange(input, header.ciphertextBytes()));
            var receipt = FramedSyncReceiptReader.read(unit, key, item.transferId, item.contentId, receiver, epoch, budget);
            consumer.accept(receipt);
            pending.remove(ByteString.copyFrom(item.transferId));
            count++;
        }
        if (!pending.isEmpty()) throw invalid("framed_sync_batch_receipt_missing");
    }

    private static byte[] prefix(InputStream input, int first) throws IOException {
        byte[] prefix = new byte[FramedSyncPreamble.BYTES + FramedSyncWireHeader.BYTES];
        prefix[0] = (byte) first;
        for (int offset = 1; offset < prefix.length;) {
            int count = input.read(prefix, offset, prefix.length - offset);
            if (count < 1) throw new IOException("framed_sync_unit_truncated");
            offset += count;
        }
        return prefix;
    }
    private static void requireReceipt(FramedSyncWireHeader header) {
        if (header.frameType() != 6 || header.sequence() != 0 || header.ciphertextBytes() < 16 ||
            header.ciphertextBytes() > FramedSyncPayloadBudget.RECEIPT_BYTES) throw invalid("framed_sync_receipt_frame_limit_exceeded");
    }
    private static IllegalArgumentException invalid(String code) { return new IllegalArgumentException(code); }

    private static final class BodyRange extends InputStream {
        final InputStream input;
        int remaining;
        BodyRange(InputStream input, int length) { this.input = input; remaining = length; }
        @Override public int read() throws IOException {
            if (remaining == 0) return -1;
            int value = input.read();
            if (value < 0) throw new IOException("framed_sync_frame_truncated");
            remaining--;
            return value;
        }
        @Override public int read(byte[] bytes, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining == 0) return -1;
            int count = input.read(bytes, offset, Math.min(remaining, length));
            if (count < 1) throw new IOException("framed_sync_frame_truncated");
            remaining -= count;
            return count;
        }
        @Override public void close() {} // The HTTP owner retains the stream between independent units.
    }
}
