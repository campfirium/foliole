package com.foliole.android;

import static org.junit.Assert.assertTrue;

import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.junit.Test;

public final class FolioleCompanionFramedSyncSchedulingTest {
    @Test public void startsFramedDeliveryWhileTheInventoryExecutorIsWaiting() throws Exception {
        FolioleCompanionSyncPlugin plugin = new FolioleCompanionSyncPlugin();
        CountDownLatch blocked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(1);
        Field ordinary = FolioleCompanionSyncPlugin.class.getDeclaredField("fileExecutor");
        ordinary.setAccessible(true);
        ExecutorService executor = (ExecutorService) ordinary.get(plugin);
        executor.execute(() -> {
            blocked.countDown();
            try { release.await(); }
            catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        });
        try {
            assertTrue(blocked.await(2, TimeUnit.SECONDS));
            PluginCall call = new PluginCall(null, "FolioleCompanionSync", "test", "send", null) {
                @Override public void reject(String message, Exception error) { completed.countDown(); }
            };
            plugin.sendFramedSyncTransfer(call);
            assertTrue("The native call must report its missing host context without waiting for inventory",
                completed.await(2, TimeUnit.SECONDS));
        } finally {
            release.countDown();
            for (Field field : FolioleCompanionSyncPlugin.class.getDeclaredFields()) {
                if (!ExecutorService.class.isAssignableFrom(field.getType())) continue;
                field.setAccessible(true);
                ((ExecutorService) field.get(plugin)).shutdownNow();
            }
        }
    }
}
