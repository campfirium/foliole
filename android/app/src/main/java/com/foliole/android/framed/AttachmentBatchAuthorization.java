package com.foliole.android.framed;

import com.foliole.sync.v22.RequestAttachment;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

/** One ordered batch's bounded write permissions, narrowed by authenticated descriptions. */
public final class AttachmentBatchAuthorization {
    public static final int PAYLOAD_BYTES = 16 * 1024 * 1024;
    public static final int METADATA_BYTES = 256 * 1024;
    public static final int MAX_FRAMES = 1024;
    public static final int MAX_ENTRIES = 256;
    public static final int BLOCK_BYTES = 524288;
    public enum Event { DESCRIPTION, BLOCK, FILE_END, RANGE_END, RESTART, UNAVAILABLE, BATCH_END }
    public static final class Entry {
        public final String key;
        public final long start, knownLength, partialLength;
        public Entry(String key, long start, long knownLength, long partialLength) {
            if (key == null || !key.matches("[a-f0-9]{64}\\.(png|jpg|gif|webp|pdf|epub|pdftext)") ||
                start < 0 || start % BLOCK_BYTES != 0 || partialLength < start || partialLength > FramedSyncContract.MAX_BLOB_BYTES ||
                knownLength < 0 || knownLength > FramedSyncContract.MAX_BLOB_BYTES) throw invalid();
            this.key = key; this.start = start; this.knownLength = knownLength; this.partialLength = partialLength;
        }
    }
    private final byte[] requestId;
    private final List<Entry> entries;
    private int index, frames, metadata, payload;
    private long length, offset;
    private boolean writing, rangeEnded, ended;

    public AttachmentBatchAuthorization(byte[] requestId, List<Entry> entries) {
        if (requestId == null || requestId.length != 16 || entries.isEmpty() || entries.size() > MAX_ENTRIES) throw invalid();
        var hashes = new HashSet<String>();
        for (Entry entry : entries) if (!hashes.add(entry.key.substring(0, 64))) throw invalid();
        this.requestId = requestId.clone(); this.entries = List.copyOf(entries);
    }
    public long maximumWireBytes() { return 96L + PAYLOAD_BYTES + METADATA_BYTES + 32L * MAX_FRAMES; }
    public Entry entry() { if (index >= entries.size()) throw invalid(); return entries.get(index); }
    public int payloadBytes() { return payload; }
    public int processedEntries() { return index; }
    public void finish() { if (!ended) throw new IllegalArgumentException("attachment_batch_incomplete"); }

    public Event accept(RequestAttachment value, int encodedBytes) {
        if (ended || !value.getOperation().equals("batch_pull") || !Arrays.equals(requestId, value.getRequestId().toByteArray()) ||
            value.getStorageKeysCount() != 0 || !value.getDerive().isEmpty() || value.getExtractorVersion() != 0 || value.getParsingPending()) throw invalid();
        int overhead = encodedBytes - value.getData().size();
        frames++; payload += value.getData().size(); metadata += overhead;
        if (overhead < 0 || overhead > 24584 || metadata > METADATA_BYTES || frames > MAX_FRAMES || payload > PAYLOAD_BYTES) throw invalid();
        if (value.getState().equals("batch_end")) {
            if (writing || index == 0 || !value.getStorageKey().isEmpty() || !value.getData().isEmpty() ||
                value.getByteLength() != 0 || value.getPending() || value.getOffset() != payload) throw invalid();
            ended = true; return Event.BATCH_END;
        }
        if (rangeEnded || !entry().key.equals(value.getStorageKey()) || value.getByteLength() < 0 ||
            value.getByteLength() > FramedSyncContract.MAX_BLOB_BYTES) throw invalid();
        return writing ? receive(value) : describe(value);
    }
    private Event describe(RequestAttachment value) {
        Entry entry = entry();
        if (!value.getData().isEmpty() || value.getOffset() != entry.start) throw invalid();
        if (value.getState().equals("unavailable")) {
            if (value.getByteLength() != entry.knownLength) throw invalid();
            index++; return Event.UNAVAILABLE;
        }
        if (value.getPending() || (entry.knownLength != 0 && value.getByteLength() != entry.knownLength)) throw invalid();
        if (value.getState().equals("restart")) {
            if (value.getByteLength() >= entry.start) throw invalid();
            index++; return Event.RESTART;
        }
        if (!value.getState().equals("description") || entry.start > value.getByteLength()) throw invalid();
        length = value.getByteLength(); offset = entry.start; writing = true;
        return Event.DESCRIPTION;
    }
    private Event receive(RequestAttachment value) {
        if (value.getPending() || value.getByteLength() != length || value.getOffset() != offset) throw invalid();
        if (value.getState().equals("block")) {
            long expected = Math.min(BLOCK_BYTES, length - offset);
            if (expected == 0 || value.getData().size() != expected) throw invalid();
            offset += expected; return Event.BLOCK;
        }
        if (!value.getData().isEmpty()) throw invalid();
        Event result;
        if (value.getState().equals("file_end") && offset == length) result = Event.FILE_END;
        else if (value.getState().equals("range_end") && offset < length) { rangeEnded = true; result = Event.RANGE_END; }
        else throw invalid();
        writing = false; index++; return result;
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("attachment_batch_authorization_invalid"); }
}
