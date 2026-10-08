package com.foliole.android;

import static org.junit.Assert.*;
import com.foliole.android.framed.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public final class FolioleCompanionFramedSyncSequenceRouteTest {
    @Test public void signedOriginalReceiptUnitsReplayExactlyWhilePayloadSlotsAreOccupied() throws Exception {
        byte[] unit = receipt();
        byte[] bytes = concat(unit, unit);
        var directory = Files.createTempDirectory("receipt-sequence-").toFile();
        var owner = new FramedSyncPayloadBudget("library", "generation");
        var processed = new AtomicInteger();
        try (var incoming = owner.acquire(FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD);
             var outgoing = owner.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD);
             var body = FolioleCompanionFramedHttpBody.spool(new ByteArrayInputStream(bytes), directory, hash(bytes), owner)) {
            var output = new ByteArrayOutputStream();
            FolioleCompanionFramedSyncSequenceRoute.respond(body.file, directory, output, "receiver", "epoch", owner, item -> {
                assertTrue(item.isReceipt());
                FramedSyncReceiptReader.read(item.input(), new byte[32], new byte[32], new byte[32], "receiver", "epoch", owner);
                processed.incrementAndGet();
                return null;
            });
            assertEquals(2, processed.get());
            byte[] response = output.toByteArray();
            assertArrayEquals(bytes, java.util.Arrays.copyOfRange(response, response.length - bytes.length, response.length));
            assertEquals(1, directory.list().length); // Only the signed request still belongs to its scope.
        } finally { owner.cancel(); owner.drain(); assertEquals(0, directory.list().length); directory.delete(); }
    }

    @Test public void corruptedSuffixKeepsPriorIndependentHandlerResultAndNeverWritesHttpSuccess() throws Exception {
        byte[] bytes = concat(receipt(), new byte[] {1});
        var directory = Files.createTempDirectory("receipt-sequence-").toFile();
        var owner = new FramedSyncPayloadBudget("library", "generation");
        var processed = new AtomicInteger();
        var output = new ByteArrayOutputStream();
        try (var body = FolioleCompanionFramedHttpBody.spool(new ByteArrayInputStream(bytes), directory, hash(bytes), owner)) {
            try {
                FolioleCompanionFramedSyncSequenceRoute.respond(body.file, directory, output, "receiver", "epoch", owner, item -> {
                    FramedSyncReceiptReader.read(item.input(), new byte[32], new byte[32], new byte[32], "receiver", "epoch", owner);
                    processed.incrementAndGet();
                    return null;
                });
                fail("suffix must reject");
            } catch (IllegalArgumentException expected) { assertEquals("framed_sync_unit_truncated", expected.getMessage()); }
            assertEquals(1, processed.get());
            assertEquals(0, output.size());
        } finally { owner.cancel(); owner.drain(); assertEquals(0, directory.list().length); directory.delete(); }
    }

    private static byte[] receipt() throws Exception { return FramedSyncSequenceFixture.receipt(); }
    private static byte[] concat(byte[]... parts) throws Exception {
        var output = new ByteArrayOutputStream();
        for (byte[] part : parts) output.write(part);
        return output.toByteArray();
    }
    private static String hash(byte[] bytes) throws Exception {
        var result = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format("%02x", value & 255));
        return result.toString();
    }
}
