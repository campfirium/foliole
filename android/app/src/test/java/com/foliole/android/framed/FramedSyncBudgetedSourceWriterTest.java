package com.foliole.android.framed;

import static org.junit.Assert.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Direction.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Lane.*;

import java.io.File;
import java.nio.file.Files;
import java.util.Collections;
import java.util.concurrent.*;
import org.junit.Test;

public final class FramedSyncBudgetedSourceWriterTest {
    @Test public void productionWriterConsumesBorrowedMessagesThenReplaysFrozenFramesWithSameOwner() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var input = new FramedSyncSourceWriterFixture(Collections.singletonList(
            FramedSyncFactFragmentsTest.largeFact(2, 1100 * 1024)));
        var source = new FramedSyncOutboundFactSource() {
            @Override public com.foliole.sync.v22.TransferHeader header() { return input.header(); }
            @Override public FramedSyncPayloadBudget budget() { return owner; }
            @Override public void read(int fact, int fragment, Consumer consumer) throws Exception {
                try (var loan = owner.acquire(OUTBOUND, PAYLOAD)) {
                    assertTrue(owner.validate(loan.libraryKey(), loan.generationId(), loan.id(), OUTBOUND, PAYLOAD, 2097152));
                    try { input.read(fact, fragment, consumer); }
                    finally { owner.releaseProducer(loan.libraryKey(), loan.generationId(), loan.id(), OUTBOUND, PAYLOAD, 2097152); }
                }
            }
        };
        File directory = Files.createTempDirectory("budget-source-").toFile();
        var worker = Executors.newSingleThreadExecutor();
        var originalSender = owner.acquire(OUTBOUND, PAYLOAD);
        try {
            var prepared = worker.submit(() -> {
                var staging = new FramedSyncSourceWriterFixture.Staging();
                FramedSyncTransferWriter.prepare(new byte[32], FramedSyncSourceWriterFixture.CONTEXT,
                    source, Collections.emptyList(), staging, directory);
                return staging;
            });
            try { prepared.get(100, TimeUnit.MILLISECONDS); fail("another sender occupies shared outbound slot"); }
            catch (TimeoutException expected) {}
            try (var incoming = owner.acquire(INBOUND, PAYLOAD); var receipt = owner.acquire(OUTBOUND, RECEIPT)) {
                assertEquals(1048576, receipt.capacityBytes());
            }
            originalSender.close();
            assertTrue(prepared.get(5, TimeUnit.SECONDS).finalized);
            assertEquals(input.messages.get(0).size(), input.reads);
            assertEquals(0, directory.list().length);
            try (var next = owner.acquire(OUTBOUND, PAYLOAD)) { assertEquals(2097152, next.capacityBytes()); }
        } finally {
            originalSender.close(); owner.cancel(); owner.drain(); worker.shutdownNow(); directory.delete();
        }
    }

    @Test public void producerFailureReleasesScopeAndDeletesFrozenTemporaryFile() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var original = new FramedSyncSourceWriterFixture(Collections.singletonList(FramedSyncFactFragmentsTest.largeFact(1, 12)));
        var source = new FramedSyncOutboundFactSource() {
            @Override public com.foliole.sync.v22.TransferHeader header() { return original.header(); }
            @Override public FramedSyncPayloadBudget budget() { return owner; }
            @Override public void read(int fact, int fragment, Consumer consumer) throws Exception {
                try (var loan = owner.acquire(OUTBOUND, PAYLOAD)) { throw new java.io.IOException("producer_failed"); }
            }
        };
        File directory = Files.createTempDirectory("budget-source-failure-").toFile();
        try {
            try {
                FramedSyncTransferWriter.prepare(new byte[32], FramedSyncSourceWriterFixture.CONTEXT,
                    source, Collections.emptyList(), new FramedSyncSourceWriterFixture.Staging(), directory);
                fail("failed producer must not prepare ciphertext");
            } catch (FramedSyncValidationException expected) { assertEquals("framed_sync_fact_source_changed", expected.code()); }
            assertEquals(0, directory.list().length);
            try (var next = owner.acquire(OUTBOUND, PAYLOAD)) { assertNotNull(next); }
        } finally { owner.cancel(); owner.drain(); directory.delete(); }
    }
}
