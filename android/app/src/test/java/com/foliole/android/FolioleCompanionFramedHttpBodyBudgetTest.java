package com.foliole.android;

import static org.junit.Assert.*;

import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPreamble;
import com.foliole.android.framed.FramedSyncWireHeader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.junit.Test;

public final class FolioleCompanionFramedHttpBodyBudgetTest {
    @Test public void receiptRawSpoolUsesIndependentSlotWhenIncomingAndOutgoingPayloadAreFull() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        byte[] encoded = wire(16, new byte[16]);
        File directory = Files.createTempDirectory("framed-http-budget-").toFile();
        try (var incoming = owner.acquire(FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD);
             var outgoing = owner.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            try (var body = FolioleCompanionFramedHttpBody.spool(new ByteArrayInputStream(encoded), directory, hash(encoded), owner)) {
                assertArrayEquals(encoded, Files.readAllBytes(body.file.toPath()));
            }
            assertEquals(0, directory.list().length);
        } finally { owner.cancel(); owner.drain(); directory.delete(); }
    }

    @Test public void receiptOversizeRejectsAtHeaderAndDeletesTemporarySpool() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        byte[] encoded = wire(FramedSyncPayloadBudget.RECEIPT_BYTES + 1, new byte[0]);
        File directory = Files.createTempDirectory("framed-http-budget-limit-").toFile();
        var input = new ByteArrayInputStream(encoded) {
            @Override public synchronized int read(byte[] buffer, int offset, int length) {
                if (available() == 0) throw new AssertionError("oversized receipt body must not be read");
                return super.read(buffer, offset, length);
            }
        };
        try {
            try { FolioleCompanionFramedHttpBody.spool(input, directory, hash(encoded), owner); fail("oversized receipt"); }
            catch (IllegalArgumentException expected) { assertEquals("framed_sync_receipt_frame_limit_exceeded", expected.getMessage()); }
            assertEquals(0, directory.list().length);
        } finally { owner.cancel(); owner.drain(); directory.delete(); }
    }

    private static byte[] wire(int length, byte[] ciphertext) throws Exception {
        var bytes = new ByteArrayOutputStream();
        bytes.write(FramedSyncPreamble.transfer(new byte[32], new byte[16], new byte[4]).encoded());
        bytes.write(FramedSyncWireHeader.encode(length, 0, 6));
        bytes.write(ciphertext);
        return bytes.toByteArray();
    }

    private static String hash(byte[] bytes) throws Exception {
        StringBuilder value = new StringBuilder(64);
        for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format("%02x", item & 255));
        return value.toString();
    }
}
