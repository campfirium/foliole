package com.foliole.android.framed;

import static org.junit.Assert.*;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.RequestAttachment;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public final class AttachmentBatchAuthorizationTest {
    private static final byte[] KEY = new byte[32];
    private static final FramedSyncSessionContext CONTEXT = new FramedSyncSessionContext("group", "a", "a-epoch", "b", "b-epoch");
    private static String key(int index) { return String.format("%064x.png", index + 1); }
    private static RequestAttachment value(String key, String state, long length, long offset, ByteString data) {
        return RequestAttachment.newBuilder().setRequestId(ByteString.copyFrom(new byte[16])).setOperation("batch_pull")
            .setStorageKey(key).setState(state).setByteLength(length).setOffset(offset).setData(data).setMaxBlocks(1).build();
    }
    private static AttachmentBatchAuthorization permission(int count) {
        var entries = new ArrayList<AttachmentBatchAuthorization.Entry>();
        for (int i = 0; i < count; i++) entries.add(new AttachmentBatchAuthorization.Entry(key(i), 0, 0, 0));
        return new AttachmentBatchAuthorization(new byte[16], entries);
    }
    private static List<RequestAttachment> messages(int count) {
        var result = new ArrayList<RequestAttachment>();
        var bytes = ByteString.copyFrom(new byte[128 * 1024]);
        for (int i = 0; i < count; i++) {
            result.add(value(key(i), "description", bytes.size(), 0, ByteString.EMPTY));
            result.add(value(key(i), "block", bytes.size(), 0, bytes));
            result.add(value(key(i), "file_end", bytes.size(), bytes.size(), ByteString.EMPTY));
        }
        result.add(value("", "batch_end", 0, (long) bytes.size() * count, ByteString.EMPTY));
        return result;
    }
    private static byte[] wire(List<RequestAttachment> values) throws Exception {
        var output = new ByteArrayOutputStream();
        FramedSyncSessionWriter.write(KEY, CONTEXT, consumer -> {
            for (var value : values) consumer.accept(FramedSyncCodec.decode(
                ProtocolMessage.newBuilder().setRequestAttachment(value).build().toByteArray(), 1));
        }, (session, context, nonce, sequence) -> {}, output);
        return output.toByteArray();
    }
    private static void read(byte[] data, AttachmentBatchAuthorization permission, RequestSyncAttachmentBatchReader.Consumer consume) throws Exception {
        RequestSyncAttachmentBatchReader.read(new FramedSyncStreamReader(new ByteArrayInputStream(data)), KEY, CONTEXT,
            permission, () -> {}, consume);
    }
    @Test public void authorizes128SmallFilesUnderOneSixteenMiBBatch() throws Exception {
        int[] blocks = {0}, ends = {0};
        var permission = permission(128);
        read(wire(messages(128)), permission, (event, value) -> {
            if (event == AttachmentBatchAuthorization.Event.BLOCK) { blocks[0]++; assertEquals(128 * 1024, value.getData().size()); }
            if (event == AttachmentBatchAuthorization.Event.FILE_END) ends[0]++;
        });
        assertEquals(128, blocks[0]); assertEquals(128, ends[0]); assertEquals(16 * 1024 * 1024, permission.payloadBytes());
    }
    @Test public void the129thSmallFileCannotExceedThePayloadBudget() throws Exception {
        int[] blocks = {0};
        assertThrows(Exception.class, () -> read(wire(messages(129)), permission(129), (event, value) -> {
            if (event == AttachmentBatchAuthorization.Event.BLOCK) blocks[0]++;
        }));
        assertEquals(128, blocks[0]);
    }
    @Test public void rejectsCorruptionBeforeCallingTheFileConsumerAndCapsCiphertextBeforeReadingIt() throws Exception {
        byte[] data = wire(messages(1)); data[120] ^= 1;
        assertThrows(Exception.class, () -> read(data, permission(1), (event, value) -> fail()));
        byte[] header = Arrays.copyOf(wire(messages(1)), 112);
        ByteBuffer.wrap(header, 96, 4).putInt(600000);
        var failure = assertThrows(IllegalArgumentException.class, () -> read(header, permission(1), (event, value) -> fail()));
        assertEquals("framed_sync_frame_ciphertext_limit_exceeded", failure.getMessage());
    }
    @Test public void aMissingBatchEndDoesNotEraseIndependentlyAuthenticatedFileEnds() throws Exception {
        var values = messages(2); values.remove(values.size() - 1);
        int[] ended = {0};
        assertThrows(Exception.class, () -> read(wire(values), permission(2), (event, value) -> {
            if (event == AttachmentBatchAuthorization.Event.FILE_END) ended[0]++;
        }));
        assertEquals(2, ended[0]);
    }
    @Test public void forbidsMissingFileEndsAndCanonicalAliasWriters() throws Exception {
        var values = messages(2); values.remove(2);
        assertThrows(Exception.class, () -> read(wire(values), permission(2), (event, value) -> {
            assertNotEquals(AttachmentBatchAuthorization.Event.FILE_END, event);
        }));
        assertThrows(IllegalArgumentException.class, () -> new AttachmentBatchAuthorization(new byte[16], List.of(
            new AttachmentBatchAuthorization.Entry(key(0), 0, 0, 0),
            new AttachmentBatchAuthorization.Entry(key(0).replace(".png", ".pdf"), 0, 0, 0))));
    }
    @Test public void reportsAnOverlongPartialWithoutAuthorizingWritesAndThenAcceptsAnEmptyFile() throws Exception {
        var permission = new AttachmentBatchAuthorization(new byte[16], List.of(
            new AttachmentBatchAuthorization.Entry(key(0), 1048576, 0, 1200000),
            new AttachmentBatchAuthorization.Entry(key(1), 0, 0, 0)));
        var values = List.of(value(key(0), "restart", 131072, 1048576, ByteString.EMPTY),
            value(key(1), "description", 0, 0, ByteString.EMPTY), value(key(1), "file_end", 0, 0, ByteString.EMPTY),
            value("", "batch_end", 0, 0, ByteString.EMPTY));
        var events = new ArrayList<AttachmentBatchAuthorization.Event>();
        read(wire(values), permission, (event, value) -> events.add(event));
        assertEquals(List.of(AttachmentBatchAuthorization.Event.RESTART, AttachmentBatchAuthorization.Event.DESCRIPTION,
            AttachmentBatchAuthorization.Event.FILE_END, AttachmentBatchAuthorization.Event.BATCH_END), events);
    }
}
