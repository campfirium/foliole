package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public final class FramedSyncStreamTest {
    @Test
    public void streamsFragmentedBinaryFramesWithoutTextConversion() throws Exception {
        byte[] preamble = preamble();
        byte[] header = FramedSyncWireHeader.encode(4, 7, FramedSyncFrameType.FACT.wireValue());
        byte[] ciphertext = new byte[] {0, (byte) 255, 1, (byte) 254};
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        encoded.write(preamble);
        encoded.write(header);
        encoded.write(ciphertext);

        FramedSyncStreamReader reader = new FramedSyncStreamReader(fragmented(encoded.toByteArray()));
        assertArrayEquals(preamble, reader.readPreamble().encoded());
        FramedSyncWireFrame frame = reader.readFrame();
        assertEquals(4, frame.header().ciphertextBytes());
        assertEquals(7, frame.header().sequence());
        assertEquals(FramedSyncFrameType.FACT.wireValue(), frame.header().frameType());
        assertArrayEquals(ciphertext, frame.ciphertext());
        assertNull(reader.readFrame());
    }

    @Test
    public void rejectsOversizedBodiesBeforeAllocatingOrReadingThem() throws Exception {
        byte[] header = ByteBuffer.allocate(FramedSyncWireHeader.BYTES)
            .order(ByteOrder.BIG_ENDIAN)
            .putInt(FramedSyncWireHeader.MAX_CIPHERTEXT_BYTES + 1)
            .putLong(0).putShort((short) 1).putShort((short) 0).array();
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        encoded.write(preamble());
        encoded.write(header);
        FramedSyncStreamReader reader = new FramedSyncStreamReader(
            new ByteArrayInputStream(encoded.toByteArray()));
        reader.readPreamble();
        reject(() -> reader.readFrame(), "wire_frame_limit_exceeded");
    }

    @Test
    public void rejectsTruncatedPreambleHeaderAndBody() throws Exception {
        reject(() -> new FramedSyncStreamReader(
            new ByteArrayInputStream(new byte[95])).readPreamble(),
            "framed_sync_preamble_truncated");
        byte[] preamble = preamble();
        ByteArrayOutputStream shortHeader = new ByteArrayOutputStream();
        shortHeader.write(preamble);
        shortHeader.write(new byte[15]);
        FramedSyncStreamReader headerReader = new FramedSyncStreamReader(
            new ByteArrayInputStream(shortHeader.toByteArray()));
        headerReader.readPreamble();
        reject(() -> headerReader.readFrame(), "framed_sync_frame_header_truncated");

        ByteArrayOutputStream shortBody = new ByteArrayOutputStream();
        shortBody.write(preamble);
        shortBody.write(FramedSyncWireHeader.encode(4, 0, 1));
        shortBody.write(new byte[3]);
        FramedSyncStreamReader bodyReader = new FramedSyncStreamReader(
            new ByteArrayInputStream(shortBody.toByteArray()));
        bodyReader.readPreamble();
        reject(() -> bodyReader.readFrame(), "framed_sync_frame_body_truncated");
    }

    @Test
    public void writerProducesTheExactWireBytesAndRejectsLengthMismatch() throws Exception {
        byte[] preamble = preamble();
        byte[] header = FramedSyncWireHeader.encode(2, 0, 1);
        byte[] ciphertext = new byte[] {4, 5};
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FramedSyncStreamWriter writer = new FramedSyncStreamWriter(output);
        writer.writePreamble(preamble);
        writer.writeFrame(header, ciphertext);
        ByteArrayOutputStream expected = new ByteArrayOutputStream();
        expected.write(preamble);
        expected.write(header);
        expected.write(ciphertext);
        assertArrayEquals(expected.toByteArray(), output.toByteArray());
        reject(() -> writer.writeFrame(header, new byte[] {4}),
            "framed_sync_frame_body_length_mismatch");
    }

    @Test
    public void callerMutationCannotChangeStreamReplayBytes() throws Exception {
        byte[] header = FramedSyncWireHeader.encode(4, 0, 1);
        byte[] ciphertext = {0, (byte) 255, 1, (byte) 254};
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        encoded.write(preamble());
        encoded.write(header);
        encoded.write(ciphertext);
        FramedSyncStreamReader reader = new FramedSyncStreamReader(
            new ByteArrayInputStream(encoded.toByteArray()));
        byte[] preamble = reader.readPreamble().encoded();
        FramedSyncWireFrame frame = reader.readFrame();
        frame.ciphertext()[0] = 99;
        frame.headerBytes()[0] = 99;
        ByteArrayOutputStream replay = new ByteArrayOutputStream();
        FramedSyncStreamWriter writer = new FramedSyncStreamWriter(replay);
        writer.writePreamble(preamble);
        writer.writeFrame(frame.headerBytes(), frame.ciphertext());
        assertArrayEquals(encoded.toByteArray(), replay.toByteArray());
    }

    static byte[] preamble() {
        byte[] result = new byte[FramedSyncPreamble.BYTES];
        ByteBuffer value = ByteBuffer.wrap(result).order(ByteOrder.BIG_ENDIAN);
        value.put("FOLSYNC2".getBytes(StandardCharsets.US_ASCII));
        value.putShort((short) FramedSyncPreamble.BYTES);
        value.putShort((short) FramedSyncContract.PROTOCOL_VERSION);
        value.put((byte) 1).put((byte) 0).putShort((short) 0);
        return result;
    }

    private static InputStream fragmented(byte[] input) {
        return new FilterInputStream(new ByteArrayInputStream(input)) {
            @Override public int read(byte[] buffer, int offset, int length) throws java.io.IOException {
                return super.read(buffer, offset, Math.min(length, 3));
            }
        };
    }

    private static void reject(ThrowingRunnable action, String message) throws Exception {
        try {
            action.run();
            fail("expected rejection: " + message);
        } catch (IllegalArgumentException expected) {
            assertEquals(message, expected.getMessage());
        }
    }

    private interface ThrowingRunnable { void run() throws Exception; }
}
