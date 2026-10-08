package com.foliole.android.framed;

import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

/** Frozen bounded messages; no in-memory collection of fact bodies. */
final class FramedSyncOutboundFactSpool implements AutoCloseable {
    private final File path;
    private final RandomAccessFile file;
    private final List<Long> offsets = new ArrayList<>();

    FramedSyncOutboundFactSpool(File directory) throws Exception {
        path = File.createTempFile("foliole-framed-facts-", ".spool", directory);
        file = new RandomAccessFile(path, "rw");
        offsets.add(0L);
    }

    int count() { return offsets.size() - 1; }

    FactRecord freeze(FramedSyncOutboundFactSource source, int factIndex) throws Exception {
        int first = count() + 1;
        ProtocolMessage[] previous = { null };
        boolean[] last = { false };
        for (int fragment = 0; !last[0]; fragment++) {
            boolean[] consumed = { false };
            source.read(factIndex, fragment, (bytes, tail) -> {
                if (consumed[0]) throw invalid("framed_sync_fact_source_changed");
                consumed[0] = true;
                ProtocolMessage message = FramedSyncCodec.decode(bytes, 3).wireMessage();
                FramedSyncFactFragments.continuation(previous[0], message);
                if (message.hasFact() && (previous[0] != null || !tail) ||
                    message.hasFactFragment() && tail != FramedSyncFactFragments.complete(message.getFactFragment())) {
                    throw invalid("fact_fragment_incomplete");
                }
                append(bytes);
                previous[0] = message.hasFactFragment() ? ProtocolMessage.newBuilder()
                    .setFactFragment(message.getFactFragment().toBuilder().clearData()
                        .setOffset(message.getFactFragment().getOffset() + message.getFactFragment().getData().size()))
                    .build() : null;
                last[0] = tail;
            });
            if (!consumed[0]) throw invalid("fact_fragment_incomplete");
        }
        // Drop the borrowed final message before reading the durable complete fact.
        previous[0] = null;
        file.getFD().sync();
        try (var loan = FramedSyncPayloadBudget.borrow(source.budget(),
            FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            ProtocolMessage initial = FramedSyncCodec.decode(read(first), 3).wireMessage();
            if (initial.hasFact()) return initial.getFact();
            return FramedSyncFactFragments.assemble(first, count(), this::read);
        }
    }

    byte[] read(long sequence) throws Exception {
        if (sequence <= 0 || sequence >= offsets.size()) throw invalid("fact_fragment_incomplete");
        file.seek(offsets.get((int) sequence));
        int length = file.readInt();
        if (length <= 0 || length > FramedSyncContract.MAX_FRAME_MESSAGE_BYTES) {
            throw invalid("frame_payload_limit_exceeded");
        }
        byte[] bytes = new byte[length];
        file.readFully(bytes);
        return bytes;
    }

    private void append(byte[] bytes) throws Exception {
        if (count() >= FramedSyncTransferReader.MAX_TRANSFER_FRAMES - 2) {
            throw invalid("transfer_frame_limit_exceeded");
        }
        long offset = file.length();
        file.seek(offset);
        file.writeInt(bytes.length);
        file.write(bytes);
        offsets.add(offset);
    }

    @Override public void close() throws Exception {
        try { file.close(); }
        finally { Files.deleteIfExists(path.toPath()); }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
