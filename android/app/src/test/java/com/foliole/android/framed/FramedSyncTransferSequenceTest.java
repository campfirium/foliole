package com.foliole.android.framed;

import static org.junit.Assert.*;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public final class FramedSyncTransferSequenceTest {
    @Test public void originalAuthenticatedTransfersEndAtTheirOwnTrailerAndRemainIndependent() throws Exception {
        byte[] first = transfer("first");
        byte[] second = transfer("second");
        File file = body(first, second);
        var stored = new Stored();
        try (var sequence = new FramedSyncTransferSequence(file)) {
            for (var unit = sequence.next(); unit != null; unit = sequence.next()) {
                try (var consumed = unit) {
                    assertFalse(unit.isReceipt());
                    FramedSyncTransferReader.receive(unit.input(), new byte[32], FramedSyncSourceWriterFixture.CONTEXT, stored);
                }
            }
            assertEquals(2, stored.completed);
            assertEquals(6, stored.frames);
        } finally { file.delete(); }
    }

    @Test public void truncatedSuffixAndMaliciousExtraTailKeepTheEarlierAuthenticatedUnit() throws Exception {
        byte[] first = transfer("first");
        byte[] second = transfer("second");
        for (byte[] suffix : List.of(java.util.Arrays.copyOf(second, second.length - 1), new byte[] {7})) {
            File file = body(first, suffix);
            var stored = new Stored();
            try (var sequence = new FramedSyncTransferSequence(file); var unit = sequence.next()) {
                FramedSyncTransferReader.receive(unit.input(), new byte[32], FramedSyncSourceWriterFixture.CONTEXT, stored);
                assertEquals(1, stored.completed);
                try { sequence.next(); fail("suffix must fail"); }
                catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("truncated")); }
                assertEquals(1, stored.completed);
            } finally { file.delete(); }
        }
    }

    @Test public void boundedHeaderCountAndConsumptionAreCheckedWithoutScanningMagic() throws Exception {
        byte[] transfer = transfer("first");
        File file = body(transfer, transfer);
        try (var sequence = new FramedSyncTransferSequence(file); var unit = sequence.next()) {
            assertEquals("framed_sync_unit_unconsumed", failure(sequence));
        } finally { file.delete(); }
        var prefix = FramedSyncPreamble.transfer(new byte[32], new byte[16], new byte[4]).encoded();
        byte[] header = FramedSyncWireHeader.encode(16, 0, 2);
        java.nio.ByteBuffer.wrap(header).putInt(FramedSyncWireHeader.MAX_CIPHERTEXT_BYTES + 1);
        file = body(prefix, header);
        try (var sequence = new FramedSyncTransferSequence(file)) {
            assertEquals("wire_frame_limit_exceeded", failure(sequence));
        } finally { file.delete(); }
        var output = new ByteArrayOutputStream();
        for (int i = 0; i < 129; i++) output.write(transfer);
        file = body(output.toByteArray());
        try (var sequence = new FramedSyncTransferSequence(file)) {
            for (int i = 0; i < 128; i++) try (var unit = sequence.next()) { drain(unit.input()); }
            assertEquals("framed_sync_batch_item_limit_exceeded", failure(sequence));
        } finally { file.delete(); }
    }

    @Test public void largeSingleRetainsOriginalLimitButCannotStartAnotherUnitAndGzipCannotBatch() throws Exception {
        byte[] large = structuralTransfer(1100 * 1024);
        File file = body(large, large);
        try (var sequence = new FramedSyncTransferSequence(file); var first = sequence.next()) {
            drain(first.input());
            assertEquals("framed_sync_batch_message_limit_exceeded", failure(sequence));
        } finally { file.delete(); }
        byte[] huge = structuralTransfer(FramedSyncContract.MAX_FRAME_MESSAGE_BYTES);
        file = body(huge);
        try (var sequence = new FramedSyncTransferSequence(file); var first = sequence.next()) {
            drain(first.input());
            assertNull(sequence.next());
        } finally { file.delete(); }
        file = body(huge, transfer("small"));
        try (var sequence = new FramedSyncTransferSequence(file); var first = sequence.next()) {
            drain(first.input());
            assertEquals("framed_sync_batch_message_limit_exceeded", failure(sequence));
        } finally { file.delete(); }
        byte[] gzip = transfer("gzip"); gzip[13] = 1;
        file = body(gzip, transfer("small"));
        try (var sequence = new FramedSyncTransferSequence(file); var first = sequence.next()) {
            drain(first.input());
            assertEquals("framed_sync_batch_compression_invalid", failure(sequence));
        } finally { file.delete(); }
    }

    @Test public void mixedReceiptAndTransferUnitsAndTruncatedHeadersAreRejected() throws Exception {
        var receipt = new ByteArrayOutputStream();
        receipt.write(FramedSyncPreamble.transfer(new byte[32], new byte[16], new byte[4]).encoded());
        receipt.write(FramedSyncWireHeader.encode(16, 0, 6));
        receipt.write(new byte[16]);
        File file = body(receipt.toByteArray(), transfer("other"));
        try (var sequence = new FramedSyncTransferSequence(file); var first = sequence.next()) {
            drain(first.input());
            assertEquals("framed_sync_batch_unit_kind_mismatch", failure(sequence));
        } finally { file.delete(); }
        for (int length : new int[] {0, 95, 100, 111}) {
            file = body(java.util.Arrays.copyOf(transfer("first"), length));
            try (var sequence = new FramedSyncTransferSequence(file)) {
                assertEquals("framed_sync_unit_truncated", failure(sequence));
            } finally { file.delete(); }
        }
    }

    @Test public void oversizedSecondReceiptRejectsItsDeclaredHeaderBeforeAnyBodyRead() throws Exception {
        byte[] preamble = FramedSyncPreamble.transfer(new byte[32], new byte[16], new byte[4]).encoded();
        File file = body(FramedSyncSequenceFixture.receipt(), preamble,
            FramedSyncWireHeader.encode(FramedSyncPayloadBudget.RECEIPT_BYTES + 1, 0, 6));
        try (var sequence = new FramedSyncTransferSequence(file); var first = sequence.next()) {
            drain(first.input());
            assertEquals("framed_sync_receipt_frame_limit_exceeded", failure(sequence));
        } finally { file.delete(); }
    }

    private static byte[] transfer(String id) throws Exception {
        var fact = FramedSyncFactFragmentsTest.largeFact(1, 12);
        fact = fact.toBuilder().setIdentity(fact.getIdentity().toBuilder().setFactId(id)).build();
        var staging = new FramedSyncSourceWriterFixture.Staging();
        var attempt = FramedSyncTransferWriter.prepare(new byte[32], FramedSyncSourceWriterFixture.CONTEXT,
            Collections.singletonList(fact), Collections.emptyList(), staging);
        var output = new ByteArrayOutputStream();
        FramedSyncTransferWriter.replay(attempt, staging, output);
        return output.toByteArray();
    }

    private static byte[] structuralTransfer(int plaintextLength) throws Exception {
        var output = new ByteArrayOutputStream();
        output.write(FramedSyncPreamble.transfer(new byte[32], new byte[16], new byte[4]).encoded());
        output.write(FramedSyncWireHeader.encode(plaintextLength + 16, 0, 2));
        output.write(new byte[plaintextLength + 16]);
        output.write(FramedSyncWireHeader.encode(16, 1, 5));
        output.write(new byte[16]);
        return output.toByteArray();
    }

    private static File body(byte[]... parts) throws Exception {
        File file = Files.createTempFile("framed-sequence-", ".body").toFile();
        try (var output = new java.io.FileOutputStream(file)) { for (byte[] part : parts) output.write(part); }
        return file;
    }
    private static void drain(java.io.InputStream input) throws Exception {
        byte[] buffer = new byte[4096];
        while (input.read(buffer) >= 0) {}
    }
    private static String failure(FramedSyncTransferSequence sequence) throws Exception {
        try { sequence.next(); fail("sequence must reject"); return ""; }
        catch (IllegalArgumentException expected) { return expected.getMessage(); }
    }

    private static final class Stored implements FramedSyncDurableStaging {
        int completed;
        int frames;
        @Override public FramedSyncStageOutcome admitInboundTransfer(TransferProposal proposal) { return FramedSyncStageOutcome.CREATED; }
        @Override public FramedSyncStageOutcome commitInboundFrame(FramedSyncAuthenticatedFrame frame, FramedSyncValidatedMessage message) {
            frames++;
            if (message.payload().payloadCase() == FramedSyncPayload.Case.TRANSFER_TRAILER) completed++;
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public void invalidateInboundAttempt(byte[] transfer, byte[] attempt) { fail("valid earlier unit must remain"); }
        @Override public FramedSyncStageOutcome commitReceipt(TransferReceipt receipt) { throw new UnsupportedOperationException(); }
        @Override public FramedSyncStageOutcome prepareReceiptAttempt(byte[] transfer, byte[] attempt, byte[] preamble) { throw new UnsupportedOperationException(); }
        @Override public FramedSyncStageOutcome finalizeReceiptAttempt(byte[] transfer, byte[] attempt) { throw new UnsupportedOperationException(); }
        @Override public List<FramedSyncAuthenticatedFrame> loadReplayableReceiptFrames(byte[] transfer, byte[] attempt) { throw new UnsupportedOperationException(); }
    }
}
