package com.foliole.android;

import static org.junit.Assert.*;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import java.nio.file.Files;
import java.util.concurrent.*;
import org.junit.Test;

public final class FolioleAttachmentReceiveFileTest {
    @Test public void writesDirectlyAndRefusesRepeatedOffsets() throws Exception {
        var path = Files.createTempFile("attachment-direct", ".partial");
        var owner = new FramedSyncPayloadBudget("library", "generation");
        int[] closed = {0};
        try (var writer = new FolioleAttachmentReceiveFile(path.toFile(), 0, owner, () -> closed[0]++)) {
            writer.append(0, new byte[]{1,2,3});
            assertThrows(IllegalArgumentException.class, () -> writer.append(0, new byte[]{4}));
            assertArrayEquals(new byte[]{1,2,3}, Files.readAllBytes(path));
            owner.cancel();
            assertThrows(InterruptedException.class, () -> writer.append(3, new byte[]{4}));
        } finally { Files.delete(path); }
        assertEquals(1, closed[0]);
    }
    @Test public void aNewGenerationCannotStartBeforeTheOldOperationDrains() throws Exception {
        var owner = com.foliole.android.framed.FramedSyncPayloadBudgetRegistry.configure("old-library", "old-generation");
        var cancelled = new CountDownLatch(1);
        var operation = owner.operation(cancelled::countDown);
        var executor = Executors.newSingleThreadExecutor();
        try {
            var replacement = executor.submit(() -> com.foliole.android.framed.FramedSyncPayloadBudgetRegistry.configure("new-library", "new-generation"));
            assertTrue(cancelled.await(1, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> replacement.get(50, TimeUnit.MILLISECONDS));
            assertSame(owner, com.foliole.android.framed.FramedSyncPayloadBudgetRegistry.current());
            operation.close(); assertEquals("new-generation", replacement.get(1, TimeUnit.SECONDS).generationId());
            com.foliole.android.framed.FramedSyncPayloadBudgetRegistry.close("new-library", "new-generation");
        } finally { operation.close(); executor.shutdownNow(); }
    }
    @Test public void retirementCancelsButDoesNotDrainBeforeRealIoFinishes() throws Exception {
        var owner = new FramedSyncPayloadBudget("library", "generation");
        var cancelled = new CountDownLatch(1);
        var operation = owner.operation(cancelled::countDown);
        owner.cancel(); assertTrue(cancelled.await(1, TimeUnit.SECONDS));
        var executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> drained = executor.submit(() -> { owner.drain(); return null; });
            assertThrows(TimeoutException.class, () -> drained.get(50, TimeUnit.MILLISECONDS));
            operation.close(); drained.get(1, TimeUnit.SECONDS);
            assertThrows(IllegalStateException.class, () -> owner.operation(() -> {}));
        } finally { executor.shutdownNow(); }
    }
}
