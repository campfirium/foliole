package com.foliole.android;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertNotEquals;

import android.content.Context;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class FolioleCompanionFramedSyncSchedulingTest {
    @Test public void startsFramedDeliveryWhileTheInventoryExecutorIsWaiting() throws Exception {
        FolioleCompanionSyncPlugin plugin = new FolioleCompanionSyncPlugin() {
            @Override public Context getContext() { return null; }
        };
        Thread caller = Thread.currentThread();
        AtomicReference<Thread> rejectionThread = new AtomicReference<>();
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
            FramedSyncPayloadBudgetRegistry.configure("scheduling-test", "generation");
            PluginCall call = new PluginCall(null, "FolioleCompanionSync", "test", "postRequestSyncHttp", null) {
                @Override public String getString(String name) {
                    if (name.equals("library_key")) return "scheduling-test";
                    if (name.equals("generation_id")) return "generation";
                    if (name.equals("request_id")) return "00000000-0000-0000-0000-000000000001";
                    return null;
                }
                @Override public Integer getInt(String name) { return null; }
                @Override public com.getcapacitor.JSObject getObject(String name) { return null; }
                @Override public void reject(String message, Exception error) {
                    rejectionThread.set(Thread.currentThread());
                    completed.countDown();
                }
            };
            plugin.postRequestSyncHttp(call);
            assertTrue("The native call must report its missing host context without waiting for inventory",
                completed.await(2, TimeUnit.SECONDS));
            assertNotEquals("Validation must run on the delivery executor", caller, rejectionThread.get());
        } finally {
            release.countDown();
            for (Field field : FolioleCompanionSyncPlugin.class.getDeclaredFields()) {
                if (!ExecutorService.class.isAssignableFrom(field.getType())) continue;
                field.setAccessible(true);
                ((ExecutorService) field.get(plugin)).shutdownNow();
            }
            FramedSyncPayloadBudgetRegistry.close("scheduling-test", "generation");
        }
    }
}
