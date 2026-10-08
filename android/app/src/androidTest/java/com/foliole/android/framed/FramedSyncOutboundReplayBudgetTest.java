package com.foliole.android.framed;

import static org.junit.Assert.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Direction.OUTBOUND;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Lane.PAYLOAD;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.platform.app.InstrumentationRegistry;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.Collections;
import java.util.concurrent.*;
import org.junit.Test;

public final class FramedSyncOutboundReplayBudgetTest {
    @Test public void waitingReplayDoesNotHoldTheMonitorNeededByItsCurrentProducer() throws Exception {
        Context host = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = Files.createTempDirectory(host.getCacheDir().toPath(), "framed-replay-budget-").toFile();
        Context isolated = new ContextWrapper(host) {
            @Override public Context getApplicationContext() { return this; }
            @Override public File getDatabasePath(String name) { return new File(directory, name); }
            @Override public File getFilesDir() { return directory; }
        };
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var workers = Executors.newFixedThreadPool(2);
        try (var staging = new FramedSyncOutboundSQLite(isolated, owner)) {
            var attempt = FramedSyncTransferWriter.prepare(new byte[32], new FramedSyncTransferContext(
                "group", "sender", "sender-epoch", "receiver", "receiver-epoch"),
                Collections.singletonList(fact()), Collections.emptyList(), staging);
            var original = new ByteArrayOutputStream();
            FramedSyncTransferWriter.replay(attempt, staging, original);
            var reader = new FramedSyncStreamReader(new ByteArrayInputStream(original.toByteArray()));
            var preamble = reader.readPreamble();
            ProtocolMessage header;
            try (var frame = reader.readFrame()) {
                header = ProtocolMessage.parseFrom(FramedSyncFrameCrypto.decrypt(new byte[32], preamble, frame, 0));
            }
            byte[] nextId = new byte[16]; nextId[0] = 1;
            var nextPreamble = FramedSyncPreamble.transfer(attempt.transferId(), nextId, new byte[4]);
            staging.prepareOutboundAttempt(attempt.transferId(), nextId, nextPreamble.encoded());
            ProtocolMessage nextHeader = header.toBuilder().setTransferHeader(header.getTransferHeader().toBuilder()
                .setAttemptId(ByteString.copyFrom(nextId))).build();
            try (var producerLoan = owner.acquire(OUTBOUND, PAYLOAD)) {
                var started = new CountDownLatch(1);
                var output = new ByteArrayOutputStream() {
                    @Override public synchronized void write(byte[] bytes, int offset, int count) {
                        super.write(bytes, offset, count);
                        started.countDown();
                    }
                };
                var replay = workers.submit(() -> { FramedSyncTransferWriter.replay(attempt, staging, output); return true; });
                assertTrue(started.await(2, TimeUnit.SECONDS));
                try { replay.get(100, TimeUnit.MILLISECONDS); fail("replay must wait for producer payload slot"); }
                catch (TimeoutException expected) {}
                var committed = workers.submit(() -> FramedSyncTransferWriter.persist(new byte[32], nextPreamble,
                    attempt.transferId(), nextId, 0, FramedSyncFrameType.TRANSFER_HEADER, nextHeader, staging));
                assertEquals(Long.valueOf(1), committed.get(2, TimeUnit.SECONDS));
                producerLoan.close();
                assertTrue(replay.get(2, TimeUnit.SECONDS));
                assertArrayEquals(original.toByteArray(), output.toByteArray());
            }
            staging.discardOutboundAttempts(attempt.transferId());
        } finally {
            owner.cancel(); owner.drain(); workers.shutdownNow();
            try (var paths = Files.walk(directory.toPath())) {
                for (var path : paths.sorted(java.util.Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new)) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    private static FactRecord fact() {
        return FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder().setKind(FactKind.FACT_KIND_OBJECT_STATE)
            .setObjectType("settings").setGlobalId("settings-1").setFactId("state-1"))
            .setSharedStateHash(ByteString.copyFrom(new byte[32])).setBody(CanonicalObject.getDefaultInstance()).build();
    }
}
