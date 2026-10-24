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

    @Test public void streamsSixteenMiBAsBoundedNativeBlocksAndSmallMetadata() throws Exception {
        int[] next = { 0 };
        RequestSyncAttachmentResponseReader.read(new ByteArrayInputStream(wire(32)), KEY, CONTEXT, () -> {}, (index, metadata, block) -> {
            assertEquals(next[0]++, index);
            assertTrue(metadata.length < 256);
            var message = ProtocolMessage.parseFrom(metadata).getRequestAttachment();
            assertTrue(message.getData().isEmpty());
            assertEquals(index == 32 ? 0 : 524288, block.length);
            if (block.length > 0) assertEquals((byte) index, block[0]);
        });
        assertEquals(33, next[0]);
    }

    @Test public void streamsThirtyTwoMiBWithinAnExplicitLargerWindow() throws Exception {
        int[] count = { 0 };
        RequestSyncAttachmentResponseReader.read(new FramedSyncStreamReader(new ByteArrayInputStream(wire(64))), KEY, CONTEXT,
            64, () -> {}, (index, metadata, block) -> { assertTrue(metadata.length < 256); count[0]++; });
        assertEquals(65, count[0]);
    }

    @Test public void rejectsCorruptionBeforeHandingTheDamagedBlockToTheConsumer() throws Exception {
        byte[] body = wire(1); body[120] ^= 1;
        int[] count = { 0 };
        assertThrows(Exception.class, () -> RequestSyncAttachmentResponseReader.read(new ByteArrayInputStream(body), KEY, CONTEXT,
            () -> {}, (index, metadata, block) -> count[0]++));
        assertEquals(0, count[0]);
    }

    @Test public void rejectsWrongPeerTruncationAndCancellation() throws Exception {
        byte[] body = wire(1);
        assertThrows(Exception.class, () -> RequestSyncAttachmentResponseReader.read(new ByteArrayInputStream(body), KEY,
            new FramedSyncSessionContext("group", "other", "a-epoch", "b", "b-epoch"), () -> {}, (i, m, b) -> fail()));
        assertThrows(Exception.class, () -> RequestSyncAttachmentResponseReader.read(new ByteArrayInputStream(Arrays.copyOf(body, 150)), KEY,
            CONTEXT, () -> {}, (i, m, b) -> fail()));
        assertThrows(InterruptedException.class, () -> RequestSyncAttachmentResponseReader.read(new ByteArrayInputStream(body), KEY,
            CONTEXT, () -> { throw new InterruptedException("cancelled"); }, (i, m, b) -> fail()));
    }

    @Test public void rejectsResponsesLargerThanTheWindow() throws Exception {
        assertThrows(Exception.class, () -> RequestSyncAttachmentResponseReader.read(new ByteArrayInputStream(wire(33)), KEY,
            CONTEXT, () -> {}, (i, m, b) -> {}));
    }
}
