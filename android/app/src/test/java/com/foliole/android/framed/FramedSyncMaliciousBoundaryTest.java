package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.google.protobuf.InvalidProtocolBufferException;
import org.junit.Test;

public class FramedSyncMaliciousBoundaryTest {
    @Test
    public void generatedTypesRejectEveryMaliciousCorpusMessage() throws Exception {
        assertEquals(10, FramedSyncMaliciousMessages.all().size());
        for (FramedSyncMaliciousMessages.Case vector : FramedSyncMaliciousMessages.all()) {
            try {
                FramedSyncGeneratedValidator.parse(vector.message.toByteArray());
                fail("accepted malicious vector: " + vector.name);
            } catch (InvalidProtocolBufferException expected) {
                assertEquals(vector.name, vector.error, expected.getMessage());
            }
        }
    }

    @Test
    public void rejectsOversizedTruncatedAndOverflowingLengths() {
        reject(new byte[2 * 1024 * 1024 + 1], "protobuf_message_limit_exceeded");
        reject(new byte[] {(byte) 0x0a, 0x02, 0x08}, null);
        reject(new byte[] {(byte) 0x0a, (byte) 0x80, (byte) 0x80, (byte) 0x80,
            (byte) 0x80, (byte) 0x80, (byte) 0x80, (byte) 0x80, (byte) 0x80,
            (byte) 0x80, (byte) 0x80, 0x01}, null);
    }

    @Test
    public void acceptsTheExactCiphertextFrameLimit() {
        byte[] header = new byte[16];
        header[0] = 0x00;
        header[1] = 0x10;
        header[2] = 0x00;
        header[3] = 0x00;
        header[13] = 0x01;
        FramedSyncFrameHeader.validate(header);
    }

    private static void reject(byte[] bytes, String message) {
        try {
            FramedSyncGeneratedValidator.parse(bytes);
            fail("expected generated protobuf rejection");
        } catch (InvalidProtocolBufferException error) {
            if (message != null) assertEquals(message, error.getMessage());
            else assertTrue(error.getMessage() != null && !error.getMessage().isEmpty());
        }
    }
}
