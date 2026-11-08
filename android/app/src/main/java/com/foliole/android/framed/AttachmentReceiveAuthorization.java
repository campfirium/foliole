package com.foliole.android.framed;

import com.foliole.sync.v22.RequestAttachment;
import java.util.Arrays;

/** One request's write permission, never a persisted transfer cursor. */
public final class AttachmentReceiveAuthorization {
    public static final int BLOCK_BYTES = 524288;
    public final byte[] requestId;
    public final String storageKey;
    public final long byteLength;
    public final long start;
    public final int maxBlocks;
    private long offset;
    private int blocks;
    private boolean ended;
    private boolean pending;

    public AttachmentReceiveAuthorization(byte[] requestId, String storageKey, long byteLength, long start, int maxBlocks) {
        if (requestId == null || requestId.length != 16 || storageKey == null ||
            !storageKey.matches("[a-f0-9]{64}\\.(png|jpg|gif|webp|pdf|epub|pdftext)") ||
            byteLength <= 0 || byteLength > 8589934592L || start < 0 || start >= byteLength ||
            start % BLOCK_BYTES != 0 || maxBlocks < 1 || maxBlocks > 64) throw invalid();
        this.requestId = requestId.clone(); this.storageKey = storageKey; this.byteLength = byteLength;
        this.start = start; this.offset = start; this.maxBlocks = maxBlocks;
    }
    public long maximumWireBytes() { return 96L + (long) maxBlocks * BLOCK_BYTES + (maxBlocks + 1L) * (24576 + 48); }
    public long offset() { return offset; }
    public int blocks() { return blocks; }
    public boolean pending() { return pending; }
    public void finish() { if (!ended) throw new IllegalArgumentException("attachment_response_incomplete"); }

    public boolean accept(RequestAttachment value) {
        if (ended || !Arrays.equals(requestId, value.getRequestId().toByteArray()) ||
            !storageKey.equals(value.getStorageKey()) || !value.getOperation().equals("pull") ||
            value.getByteLength() != byteLength || value.getOffset() != offset) throw invalid();
        if (value.getState().equals("end")) {
            if (!value.getData().isEmpty() || (blocks == 0 && !value.getPending() && offset != byteLength)) throw invalid();
            ended = true; pending = value.getPending(); return false;
        }
        if (!value.getState().equals("block") || blocks >= maxBlocks || offset >= byteLength ||
            value.getData().size() != Math.min(BLOCK_BYTES, byteLength - offset)) throw invalid();
        offset += value.getData().size(); blocks++; return true;
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("attachment_receive_authorization_invalid"); }
}
