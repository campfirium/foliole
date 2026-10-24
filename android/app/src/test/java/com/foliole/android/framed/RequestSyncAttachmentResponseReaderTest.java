package com.foliole.android.framed;

import static org.junit.Assert.*;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.RequestAttachment;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import org.junit.Test;

public final class RequestSyncAttachmentResponseReaderTest {
    private static final byte[] KEY = new byte[32];
    private static final FramedSyncSessionContext CONTEXT = new FramedSyncSessionContext("group", "a", "a-epoch", "b", "b-epoch");

    private byte[] wire(int blocks) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncSessionWriter.write(KEY, CONTEXT, consume -> {
            for (int i = 0; i <= blocks; i++) {
                RequestAttachment.Builder attachment = RequestAttachment.newBuilder()
                    .setRequestId(ByteString.copyFrom(new byte[16])).setOperation("pull")
                    .setStorageKey("a".repeat(64) + ".pdftext").setByteLength((long) blocks * 524288)
                    .setOffset((long) i * 524288).setMaxBlocks(Math.min(blocks, 64)).setState(i == blocks ? "end" : "block");
                if (i < blocks) { byte[] bytes = new byte[524288]; Arrays.fill(bytes, (byte) i); attachment.setData(ByteString.copyFrom(bytes)); }
                ProtocolMessage message = ProtocolMessage.newBuilder().setRequestAttachment(attachment).build();
                consume.accept(FramedSyncCodec.decode(message.toByteArray(), 1));
            }
        }, (session, context, nonce, sequence) -> {}, output);
        return output.toByteArray();
    }

    private AttachmentReceiveAuthorization permission(int size, int limit) {
        return new AttachmentReceiveAuthorization(new byte[16], "a".repeat(64) + ".pdftext", (long) size * 524288, 0, limit);
    }
    private void read(byte[] body, AttachmentReceiveAuthorization permission, RequestSyncAttachmentResponseReader.Check check,
        RequestSyncAttachmentResponseReader.Consumer consume) throws Exception {
        RequestSyncAttachmentResponseReader.read(new FramedSyncStreamReader(new ByteArrayInputStream(body)), KEY, CONTEXT, permission, check, consume);
    }
    @Test public void streamsSixteenMiBDirectlyAsBoundedAuthorizedBlocks() throws Exception {
        int[] next = { 0 }; var permission = permission(32, 32);
        read(wire(32), permission, () -> {}, (offset, block) -> {
            assertEquals((long) next[0] * 524288, offset);
            assertEquals((byte) next[0]++, block[0]); assertEquals(524288, block.length);
        });
        assertEquals(32, next[0]); assertEquals(16777216, permission.offset());
    }
    @Test public void streamsThirtyTwoMiBWithinAnExplicitLargerWindow() throws Exception {
        int[] count = { 0 };
        read(wire(64), permission(64, 64), () -> {}, (offset, block) -> count[0]++);
        assertEquals(64, count[0]);
    }
    @Test public void rejectsCorruptionBeforeHandingTheDamagedBlockToTheConsumer() throws Exception {
        byte[] body = wire(1); body[120] ^= 1;
        assertThrows(Exception.class, () -> read(body, permission(1, 1), () -> {}, (offset, block) -> fail()));
    }
    @Test public void rejectsWrongAuthorizationBeforeWriting() throws Exception {
        byte[] body = wire(2);
        for (var permission : new AttachmentReceiveAuthorization[] {
            new AttachmentReceiveAuthorization(new byte[16], "b".repeat(64) + ".pdftext", 1048576, 0, 2),
            new AttachmentReceiveAuthorization(new byte[16], "a".repeat(64) + ".pdftext", 1048577, 0, 2),
            new AttachmentReceiveAuthorization(new byte[16], "a".repeat(64) + ".pdftext", 1048576, 524288, 2),
            new AttachmentReceiveAuthorization(new byte[]{1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0}, "a".repeat(64) + ".pdftext", 1048576, 0, 2)
        }) assertThrows(Exception.class, () -> read(body, permission, () -> {}, (offset, block) -> fail()));
    }
    @Test public void rejectsTruncationAndCancellation() throws Exception {
        byte[] body = wire(1);
        assertThrows(Exception.class, () -> read(Arrays.copyOf(body, 150), permission(1, 1), () -> {}, (offset, block) -> fail()));
        assertThrows(InterruptedException.class, () -> read(body, permission(1, 1), () -> { throw new InterruptedException("cancelled"); }, (offset, block) -> fail()));
    }
    @Test public void rejectsExtraFramesAndMissingEndAfterKeepingOnlyTheValidPrefix() throws Exception {
        int[] count = {0};
        assertThrows(Exception.class, () -> read(wire(33), permission(33, 32), () -> {}, (offset, block) -> count[0]++));
        assertEquals(32, count[0]);
        byte[] body = wire(1);
        int firstFrameLength = java.nio.ByteBuffer.wrap(body, 96, 4).getInt();
        assertThrows(Exception.class, () -> read(Arrays.copyOf(body, 112 + firstFrameLength), permission(1, 1), () -> {}, (offset, block) -> {}));
    }
}
