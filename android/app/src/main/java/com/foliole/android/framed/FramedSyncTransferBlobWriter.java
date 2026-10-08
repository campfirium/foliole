package com.foliole.android.framed;

import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.io.InputStream;
import java.security.MessageDigest;

final class FramedSyncTransferBlobWriter {
    interface FrameWriter {
        long write(long sequence, ProtocolMessage message) throws Exception;
    }

    private FramedSyncTransferBlobWriter() {}

    static long write(byte[] transferId, long sequence, FramedSyncBlobContent content,
        BlobReference reference, FrameWriter frames) throws Exception {
        return write(transferId, sequence, content, reference, frames, null);
    }

    static long write(byte[] transferId, long sequence, FramedSyncBlobContent content,
        BlobReference reference, FrameWriter frames, FramedSyncPayloadBudget budget) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        boolean body = FramedSyncBodyRoles.isBody(reference.getRoleValue());
        if (body && content.byteLength() > 1_048_576) {
            throw new FramedSyncValidationException("blob_size_limit_exceeded");
        }
        long offset = 0;
        try (InputStream input = content.open()) {
            while (true) {
                try (var loan = FramedSyncPayloadBudget.borrow(budget,
                    FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
                    byte[] buffer = new byte[body ? 1_048_576 : FramedSyncContract.BLOB_CHUNK_BYTES];
                    int length = readChunk(input, buffer);
                    if (length == 0) break;
                    if (body && (offset != 0 || length != content.byteLength())) {
                        throw new FramedSyncValidationException("framed_sync_blob_content_mismatch");
                    }
                    digest.update(buffer, 0, length);
                    ProtocolMessage chunk = ProtocolMessage.newBuilder().setBlobChunk(BlobChunk.newBuilder()
                        .setTransferId(ByteString.copyFrom(transferId))
                        .setBlobHash(ByteString.copyFrom(content.sha256())).setOffset(offset)
                        .setData(ByteString.copyFrom(buffer, 0, length))).build();
                    sequence = frames.write(sequence, chunk);
                    offset += length;
                }
            }
        }
        if (offset != content.byteLength() || !MessageDigest.isEqual(content.sha256(), digest.digest())) {
            throw new FramedSyncValidationException("framed_sync_blob_content_mismatch");
        }
        return sequence;
    }

    private static int readChunk(InputStream input, byte[] buffer) throws Exception {
        int offset = 0;
        while (offset < buffer.length) {
            int count = input.read(buffer, offset, buffer.length - offset);
            if (count < 0) break;
            if (count > 0) offset += count;
        }
        return offset;
    }
}
