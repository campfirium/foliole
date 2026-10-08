package com.foliole.android.framed;

import static org.junit.Assert.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Direction.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Lane.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.*;
import org.junit.Test;

public final class FramedSyncBudgetedStreamTest {
    @Test public void incomingFrameHoldsOneSharedLoanThroughConsumerAndFailureReleasesIt() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var first = reader(owner, INBOUND, PAYLOAD, wire(3, 16, new byte[16]));
        var second = reader(owner, INBOUND, PAYLOAD, wire(3, 16, new byte[16]));
        var worker = Executors.newSingleThreadExecutor();
        try (var consumed = first.readFrame()) {
            var next = worker.submit(second::readFrame);
            try { next.get(100, TimeUnit.MILLISECONDS); fail("incoming loan must span consumption"); }
            catch (TimeoutException expected) {}
            try (var outbound = owner.acquire(OUTBOUND, PAYLOAD);
                 var receipt = reader(owner, INBOUND, RECEIPT, wire(6, 16, new byte[16])).readFrame()) {
                assertNotNull(receipt);
            }
            consumed.close();
            next.get(2, TimeUnit.SECONDS).close();
            try { reader(owner, INBOUND, PAYLOAD, wire(3, 16, new byte[2])).readFrame(); fail("truncated"); }
            catch (IllegalArgumentException expected) { assertEquals("framed_sync_frame_body_truncated", expected.getMessage()); }
            try (var recovered = owner.acquire(INBOUND, PAYLOAD)) { assertEquals(2097152, recovered.capacityBytes()); }
        } finally { owner.cancel(); owner.drain(); worker.shutdownNow(); }
    }

    @Test public void receiptRejectsOversizeOrInventoryBeforeReadingCiphertext() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        for (int type : new int[] {6, 1}) {
            byte[] prefix = wire(type, type == 6 ? 1048577 : 16, new byte[0]);
            InputStream input = new ByteArrayInputStream(prefix) {
                @Override public synchronized int read(byte[] bytes, int offset, int count) {
                    if (available() == 0) throw new AssertionError("receipt body must not be read");
                    return super.read(bytes, offset, count);
                }
            };
            var reader = new FramedSyncStreamReader(input).budgeted(owner, INBOUND, RECEIPT);
            reader.readPreamble();
            try { reader.readFrame(); fail("strict receipt header required"); }
            catch (IllegalArgumentException expected) { assertEquals("framed_sync_receipt_frame_limit_exceeded", expected.getMessage()); }
        }
        owner.cancel(); owner.drain();
    }

    @Test public void receiptBodyKeepsSlotThroughItsConsumerAndReturnsItOnFailure() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var worker = Executors.newSingleThreadExecutor();
        try (var body = FramedSyncReceiptBody.create(owner, () -> wire(6, 16, new byte[16]))) {
            var next = worker.submit(() -> owner.acquire(OUTBOUND, RECEIPT));
            try { next.get(100, TimeUnit.MILLISECONDS); fail("receipt cannot release before HTTP consumer"); }
            catch (TimeoutException expected) {}
            try { body.copyTo(new java.io.OutputStream() {
                @Override public void write(int value) throws java.io.IOException { throw new java.io.IOException("consumer_failed"); }
            }); fail("consumer failure"); }
            catch (java.io.IOException expected) { assertEquals("consumer_failed", expected.getMessage()); }
            body.close();
            next.get(2, TimeUnit.SECONDS).close();
        } finally { owner.cancel(); owner.drain(); worker.shutdownNow(); }
    }

    private static FramedSyncStreamReader reader(FramedSyncPayloadBudget owner,
        FramedSyncPayloadBudget.Direction direction, FramedSyncPayloadBudget.Lane lane, byte[] bytes) throws Exception {
        var reader = new FramedSyncStreamReader(new ByteArrayInputStream(bytes)).budgeted(owner, direction, lane);
        reader.readPreamble();
        return reader;
    }

    private static byte[] wire(int type, int length, byte[] body) throws Exception {
        var bytes = new ByteArrayOutputStream();
        bytes.write(FramedSyncPreamble.transfer(new byte[32], new byte[16], new byte[4]).encoded());
        bytes.write(FramedSyncWireHeader.encode(length, 0, type));
        bytes.write(body);
        return bytes.toByteArray();
    }
}
