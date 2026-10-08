package com.foliole.android.framed;

import static org.junit.Assert.*;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public final class FramedSyncTransferSequenceStreamTest {
    @Test(timeout = 10000) public void originalAuthenticatedUnitsCommitBeforeFollowingUnitIsRead() throws Exception {
        var sequence = new FramedSyncTransferSequenceStream(new ByteArrayInputStream(concat(transfer("first"), transfer("second"))));
        var stored = new Stored();
        var budget = new FramedSyncPayloadBudget("library", "generation");
        for (InputStream unit = sequence.next(); unit != null; unit = sequence.next()) {
            FramedSyncTransferReader.receive(unit, new byte[32], FramedSyncSourceWriterFixture.CONTEXT, stored, budget,
                header -> assertEquals(stored.completed == 0 ? "first" : "second", header.getManifest().getFacts(0).getIdentity().getFactId()));
        }
        assertEquals(2, stored.completed);
        assertEquals(2, stored.admitted);
        budget.cancel(); budget.drain();
    }

    @Test public void truncatedLaterUnitKeepsTheEarlierAuthenticatedCommit() throws Exception {
        byte[] second = transfer("second");
        var sequence = new FramedSyncTransferSequenceStream(new ByteArrayInputStream(concat(transfer("first"),
            java.util.Arrays.copyOf(second, second.length - 1))));
        var stored = new Stored();
        FramedSyncTransferReader.receive(sequence.next(), new byte[32], FramedSyncSourceWriterFixture.CONTEXT, stored);
        assertEquals(1, stored.completed);
        try {
            FramedSyncTransferReader.receive(sequence.next(), new byte[32], FramedSyncSourceWriterFixture.CONTEXT, stored);
            fail("truncated unit must reject");
        } catch (java.io.IOException expected) { assertTrue(expected.getMessage().contains("truncated")); }
        assertEquals(1, stored.completed);
    }

    @Test public void wrongRequestedHeaderRejectsBeforeAnyStagingAdmission() throws Exception {
        var stored = new Stored();
        var budget = new FramedSyncPayloadBudget("library", "generation");
        try {
            FramedSyncTransferReader.receive(new ByteArrayInputStream(transfer("other")), new byte[32],
                FramedSyncSourceWriterFixture.CONTEXT, stored, budget,
                header -> { throw new IllegalArgumentException("framed_sync_requested_fact_set_mismatch"); });
            fail("wrong header must reject");
        } catch (IllegalArgumentException expected) { assertEquals("framed_sync_requested_fact_set_mismatch", expected.getMessage()); }
        assertEquals(0, stored.admitted);
        assertEquals(0, stored.frames);
    }

    @Test public void cleanPrefixEndsSuccessfullyAndUnconsumedUnitCannotAdvance() throws Exception {
        var sequence = new FramedSyncTransferSequenceStream(new ByteArrayInputStream(transfer("first")));
        var unit = sequence.next();
        try { sequence.next(); fail("unit must be consumed"); }
        catch (IllegalArgumentException expected) { assertEquals("framed_sync_unit_unconsumed", expected.getMessage()); }
        unit.readAllBytes();
        assertNull(sequence.next());
    }

    @Test public void declaredSecondBodyRejectsTheAggregateBeforeItIsRead() throws Exception {
        var prefix = FramedSyncPreamble.transfer(new byte[32], new byte[16], new byte[4]).encoded();
        var sequence = new FramedSyncTransferSequenceStream(new ByteArrayInputStream(concat(transfer("first"), prefix,
            FramedSyncWireHeader.encode(FramedSyncContract.MAX_FRAME_MESSAGE_BYTES + 16, 0, 2))));
        sequence.next().readAllBytes();
        try { sequence.next().readAllBytes(); fail("declared aggregate must reject"); }
        catch (IllegalArgumentException expected) { assertEquals("framed_sync_batch_message_limit_exceeded", expected.getMessage()); }
    }

    @Test public void onlyActuallyReturnedPrefixIsReportedAndUnexpectedExtraRejects() throws Exception {
        byte[] first = transfer("first");
        var stored = new Stored();
        int received = FramedSyncTransferSequenceStream.read(new ByteArrayInputStream(first), 2, (unit, index) -> {
            assertEquals(0, index);
            FramedSyncTransferReader.receive(unit, new byte[32], FramedSyncSourceWriterFixture.CONTEXT, stored);
        });
        assertEquals(1, received);
        assertEquals(1, stored.completed);
        try {
            FramedSyncTransferSequenceStream.read(new ByteArrayInputStream(concat(first, transfer("second"))), 1,
                (unit, index) -> FramedSyncTransferReader.receive(unit, new byte[32], FramedSyncSourceWriterFixture.CONTEXT, new Stored()));
            fail("extra response must reject");
        } catch (IllegalArgumentException expected) { assertEquals("framed_sync_batch_response_unexpected", expected.getMessage()); }
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
    private static byte[] concat(byte[]... parts) throws Exception {
        var output = new ByteArrayOutputStream();
        for (byte[] part : parts) output.write(part);
        return output.toByteArray();
    }
    private static final class Stored implements FramedSyncDurableStaging {
        int admitted;
        int frames;
        int completed;
        @Override public FramedSyncStageOutcome admitInboundTransfer(TransferProposal proposal) { admitted++; return FramedSyncStageOutcome.CREATED; }
        @Override public FramedSyncStageOutcome commitInboundFrame(FramedSyncAuthenticatedFrame frame, FramedSyncValidatedMessage message) {
            frames++;
            if (message.payload().payloadCase() == FramedSyncPayload.Case.TRANSFER_TRAILER) completed++;
            return FramedSyncStageOutcome.CREATED;
        }
        @Override public void invalidateInboundAttempt(byte[] transfer, byte[] attempt) { fail("transport interruption must preserve staging"); }
        @Override public FramedSyncStageOutcome commitReceipt(TransferReceipt receipt) { throw new UnsupportedOperationException(); }
        @Override public FramedSyncStageOutcome prepareReceiptAttempt(byte[] transfer, byte[] attempt, byte[] preamble) { throw new UnsupportedOperationException(); }
        @Override public FramedSyncStageOutcome finalizeReceiptAttempt(byte[] transfer, byte[] attempt) { throw new UnsupportedOperationException(); }
        @Override public List<FramedSyncAuthenticatedFrame> loadReplayableReceiptFrames(byte[] transfer, byte[] attempt) { throw new UnsupportedOperationException(); }
    }
}
