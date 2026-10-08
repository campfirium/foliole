package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class FramedSyncReceiptSequenceReaderTest {
    @Test public void originalReceiptsCompleteIndividuallyBeforeReadingTheNextUnitWhilePayloadSlotsAreFull() throws Exception {
        byte[] first = FramedSyncSequenceFixture.receipt(1);
        byte[] bytes = concat(first, FramedSyncSequenceFixture.receipt(2));
        var completed = new ArrayList<Integer>();
        var input = new ByteArrayInputStream(bytes) {
            private void progress() { if (pos >= first.length) assertEquals(List.of(1), completed); }
            @Override public synchronized int read() { if (pos == first.length) progress(); return super.read(); }
            @Override public synchronized int read(byte[] target, int offset, int length) { if (pos == first.length) progress(); return super.read(target, offset, length); }
        };
        var budget = new FramedSyncPayloadBudget("library", "generation");
        try (var incoming = budget.acquire(FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD);
             var outgoing = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            FramedSyncReceiptSequenceReader.read(input, new byte[32], "receiver", "epoch", List.of(expected(1), expected(2)), budget,
                receipt -> completed.add((int) receipt.getTransferId().byteAt(0)));
            assertEquals(List.of(1, 2), completed);
        } finally { budget.cancel(); budget.drain(); }
    }
    @Test public void duplicateMissingAndTruncatedSuffixesRetainCompletedReceipts() throws Exception {
        byte[] second = FramedSyncSequenceFixture.receipt(2);
        List<byte[]> suffixes = List.of(FramedSyncSequenceFixture.receipt(1), new byte[0],
            java.util.Arrays.copyOf(second, second.length - 1), new byte[] {7});
        for (byte[] suffix : suffixes) {
            var completed = new ArrayList<Integer>();
            var budget = new FramedSyncPayloadBudget("library", "generation");
            try {
                FramedSyncReceiptSequenceReader.read(new ByteArrayInputStream(concat(FramedSyncSequenceFixture.receipt(1), suffix)),
                    new byte[32], "receiver", "epoch", List.of(expected(1), expected(2)), budget,
                    receipt -> completed.add((int) receipt.getTransferId().byteAt(0)));
                fail("invalid receipt suffix must fail");
            } catch (IllegalArgumentException | IOException expected) { assertEquals(List.of(1), completed); }
            finally { budget.cancel(); budget.drain(); }
        }
    }
    @Test public void wrongReceiptIdentityAndOversizedDeclaredFrameNeverComplete() throws Exception {
        var budget = new FramedSyncPayloadBudget("library", "generation");
        try {
            try {
                FramedSyncReceiptSequenceReader.read(new ByteArrayInputStream(FramedSyncSequenceFixture.receipt(1)), new byte[32],
                    "another-receiver", "epoch", List.of(expected(1)), budget, receipt -> fail("wrong receiver"));
                fail("identity mismatch");
            } catch (FramedSyncValidationException expected) { assertEquals("framed_sync_receipt_identity_mismatch", expected.code()); }
            byte[] prefix = concat(FramedSyncPreamble.transfer(identity(1), new byte[16], new byte[4]).encoded(),
                FramedSyncWireHeader.encode(FramedSyncPayloadBudget.RECEIPT_BYTES + 1, 0, 6));
            try {
                FramedSyncReceiptSequenceReader.read(new ByteArrayInputStream(prefix), new byte[32], "receiver", "epoch", List.of(expected(1)), budget,
                    receipt -> fail("oversized declaration"));
                fail("oversized header");
            } catch (IllegalArgumentException expected) { assertEquals("framed_sync_receipt_frame_limit_exceeded", expected.getMessage()); }
        } finally { budget.cancel(); budget.drain(); }
    }
    private static FramedSyncReceiptSequenceReader.Expected expected(int id) {
        return new FramedSyncReceiptSequenceReader.Expected(identity(id), identity(id));
    }
    private static byte[] identity(int id) { byte[] value = new byte[32]; value[0] = (byte) id; return value; }
    private static byte[] concat(byte[]... parts) throws Exception {
        var output = new ByteArrayOutputStream();
        for (byte[] part : parts) output.write(part);
        return output.toByteArray();
    }
}
