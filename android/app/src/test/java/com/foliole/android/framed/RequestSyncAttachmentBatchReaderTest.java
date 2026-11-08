package com.foliole.android.framed;

import static org.junit.Assert.*;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.RequestAttachment;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.List;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class RequestSyncAttachmentBatchReaderTest {
    private static final int BLOCK = AttachmentReceiveAuthorization.BLOCK_BYTES;
    private static final byte[] KEY = new byte[32];
    private static final FramedSyncSessionContext CONTEXT = new FramedSyncSessionContext("group", "a", "a-epoch", "b", "b-epoch");
    @Rule public TemporaryFolder folder = new TemporaryFolder();

    @Test public void persistsCompletedMembersAndResumesFromTheWrittenPrefix() throws Exception {
        var first = permission("a", 1, 0);
        var second = permission("b", 2, 0);
        var destination = new Files();
        assertThrows(Exception.class, () -> read(List.of(first, second), destination, false));
        assertEquals(List.of(0), destination.completed);
        assertEquals(BLOCK, destination.file(first).length());
        assertEquals(BLOCK, destination.file(second).length());
        read(List.of(permission("b", 2, BLOCK)), destination, true);
        assertEquals(List.of(0, 0), destination.completed);
        assertEquals(2L * BLOCK, destination.file(second).length());
    }

    @Test public void refusesFramesForADifferentMemberBeforeWriting() throws Exception {
        var expected = permission("a", 1, 0);
        var destination = new Files();
        var wire = wire(List.of(permission("b", 1, 0)), true);
        assertThrows(Exception.class, () -> reader(wire).read(List.of(expected), destination, () -> {}));
        assertTrue(destination.completed.isEmpty());
        assertEquals(0, destination.file(expected).length());
    }

    private static AttachmentReceiveAuthorization permission(String prefix, int blocks, long offset) {
        return new AttachmentReceiveAuthorization(new byte[16], prefix.repeat(64) + ".pdf",
            (long) blocks * BLOCK, offset, blocks - (int) (offset / BLOCK));
    }

    private static byte[] wire(List<AttachmentReceiveAuthorization> permissions, boolean finalEnd) throws Exception {
        var output = new ByteArrayOutputStream();
        FramedSyncSessionWriter.write(KEY, CONTEXT, consume -> {
            for (var permission : permissions) {
                for (long offset = permission.start; offset < permission.byteLength; offset += BLOCK) {
                    consume.accept(frame(permission, offset, ByteString.copyFrom(new byte[BLOCK])));
                }
                if (permission != permissions.get(permissions.size() - 1) || finalEnd) {
                    consume.accept(frame(permission, permission.byteLength, ByteString.EMPTY));
                }
            }
        }, (session, context, nonce, sequence) -> {}, output);
        return output.toByteArray();
    }

    private static FramedSyncValidatedMessage frame(AttachmentReceiveAuthorization permission, long offset, ByteString bytes) throws Exception {
        var attachment = RequestAttachment.newBuilder()
            .setRequestId(ByteString.copyFrom(permission.requestId)).setOperation("pull")
            .setStorageKey(permission.storageKey).setByteLength(permission.byteLength).setOffset(offset)
            .setMaxBlocks(permission.maxBlocks).setState(bytes.isEmpty() ? "end" : "block").setData(bytes);
        var message = ProtocolMessage.newBuilder().setRequestAttachment(attachment).build();
        return FramedSyncCodec.decode(message.toByteArray(), 1);
    }

    private static RequestSyncAttachmentBatchReader reader(byte[] bytes) throws Exception {
        return new RequestSyncAttachmentBatchReader(new FramedSyncStreamReader(new ByteArrayInputStream(bytes)), KEY, CONTEXT);
    }

    private static void read(List<AttachmentReceiveAuthorization> permissions, Files files, boolean finalEnd) throws Exception {
        reader(wire(permissions, finalEnd)).read(permissions, files, () -> {});
    }

    private final class Files implements RequestSyncAttachmentBatchReader.Destination {
        final List<Integer> completed = new ArrayList<>();
        java.io.File file(AttachmentReceiveAuthorization permission) {
            return new java.io.File(folder.getRoot(), permission.storageKey);
        }
        public RequestSyncAttachmentBatchReader.Member open(AttachmentReceiveAuthorization permission) throws Exception {
            var file = new RandomAccessFile(file(permission), "rw");
            assertEquals(permission.start, file.length());
            return new RequestSyncAttachmentBatchReader.Member() {
                public void append(long offset, byte[] bytes) throws Exception {
                    assertEquals(offset, file.length());
                    file.seek(offset);
                    file.write(bytes);
                }
                public void close() throws Exception { file.close(); }
            };
        }
        public void completed(int index, AttachmentReceiveAuthorization permission) {
            assertEquals(permission.byteLength, file(permission).length());
            completed.add(index);
        }
    }
}
