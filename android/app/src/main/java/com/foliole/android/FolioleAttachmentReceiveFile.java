package com.foliole.android;

import com.foliole.android.framed.FramedSyncPayloadBudget;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

/** Holds an open partial file until native I/O exits, including exceptional exits. */
final class FolioleAttachmentReceiveFile implements AutoCloseable {
    static final class StorageFailure extends IOException { StorageFailure(IOException cause) { super(cause.getMessage(), cause); } }
    private final RandomAccessFile file;
    private final FramedSyncPayloadBudget owner;
    private final Runnable finished;
    FolioleAttachmentReceiveFile(File path, long offset, FramedSyncPayloadBudget owner, Runnable finished) throws Exception {
        this.owner = owner; this.finished = finished;
        file = new RandomAccessFile(path, "rw");
        try {
            if (file.length() != offset) throw new IllegalArgumentException("attachment_partial_length_changed");
            file.seek(offset);
        } catch (Exception error) { file.close(); throw error; }
    }
    void append(long offset, byte[] bytes) throws Exception {
        if (owner.isClosed()) throw new InterruptedException("request_sync_http_cancelled");
        try {
            if (bytes.length > 524288 || file.length() != offset || file.getFilePointer() != offset) {
                throw new IllegalArgumentException("attachment_partial_length_changed");
            }
            file.write(bytes);
        } catch (IOException error) { throw new StorageFailure(error); }
    }
    public void close() throws Exception { try { file.close(); } finally { finished.run(); } }
}
