package com.foliole.android;

import com.foliole.android.framed.AttachmentFileStore;
import java.io.IOException;
import java.nio.ByteBuffer;

/** Holds an open partial file until native I/O exits, including exceptional exits. */
final class FolioleAttachmentReceiveFile implements AutoCloseable {
    static final class StorageFailure extends IOException { StorageFailure(IOException cause) { super(cause.getMessage(), cause); } }
    private final AttachmentFileStore.Receive file;
    private final AutoCloseable finished;
    FolioleAttachmentReceiveFile(AttachmentFileStore.Receive file, AutoCloseable finished) { this.file = file; this.finished = finished; }
    void append(long offset, byte[] bytes) throws Exception {
        try { file.append(offset, ByteBuffer.wrap(bytes)); }
        catch (IOException error) { throw new StorageFailure(error); }
    }
    public void close() throws Exception { try { file.close(); } finally { finished.close(); } }
}
