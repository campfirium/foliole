package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;

import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Test;

import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

public class FolioleCompanionSyncGroupProviderStartTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Object owner = new Object();
    private final Object replacement = new Object();
    private final FolioleCompanionSyncGroupProvider.Startup startup =
        new FolioleCompanionSyncGroupProvider.Startup(owner);
    private final LinkedBlockingQueue<JSObject> events = new LinkedBlockingQueue<>();

    @After public void stopProvider() {
        FolioleCompanionSyncGroupProvider.stop(replacement);
        FolioleCompanionSyncGroupProvider.stop(owner);
        FolioleCompanionSyncGroupDataBridge.uninstall(replacement);
        FolioleCompanionSyncGroupDataBridge.uninstall(owner);
    }

    @Test public void settingsReadsCurrentStateBeforeCredentialCallbackOnSameQueue() throws Exception {
        install(owner, events);
        var file = Executors.newSingleThreadExecutor();
        var capacitor = Executors.newSingleThreadExecutor();
        try {
            var starting = file.submit(begin(startup)::run);
            JSObject request = nextRequest(events);
            var reading = capacitor.submit(FolioleCompanionSyncGroupProvider::state);
            var callback = capacitor.submit(() -> { resolve(request); return null; });
            assertEquals("stopped", reading.get(2, TimeUnit.SECONDS).getString("state"));
            callback.get(2, TimeUnit.SECONDS);
            assertEquals("running", starting.get(2, TimeUnit.SECONDS).getString("state"));
        } finally {
            capacitor.shutdownNow();
            file.shutdownNow();
        }
    }

    @Test public void pauseDiscardsLateCredentialAndResumeFetchesFreshCredential() throws Exception {
        install(owner, events);
        var file = Executors.newSingleThreadExecutor();
        try {
            var starting = file.submit(begin(startup)::run);
            JSObject late = nextRequest(events);
            startup.suspend();
            var resume = startup.resume(context, null, null, () -> {}, () -> true);
            assertNotNull(resume);
            var restarted = file.submit(resume::run);
            resolve(late);
            assertEquals("stopped", starting.get(2, TimeUnit.SECONDS).getString("state"));
            resolve(nextRequest(events));
            assertEquals("running", restarted.get(2, TimeUnit.SECONDS).getString("state"));
        } finally {
            file.shutdownNow();
        }
    }

    @Test public void stopDiscardsQueuedStartBeforeItRequestsCredential() throws Exception {
        install(owner, events);
        var queued = begin(startup);
        startup.cancel();
        assertEquals("stopped", queued.run().getString("state"));
        assertNull(events.poll());
        assertNull(startup.resume(context, null, null, () -> {}, () -> true));
    }

    @Test public void replacementUsingSameBridgeIsNotOverwrittenByOldCredential() throws Exception {
        var newEvents = new LinkedBlockingQueue<JSObject>();
        var next = new FolioleCompanionSyncGroupProvider.Startup(replacement);
        install(owner, events);
        var first = Executors.newSingleThreadExecutor();
        var second = Executors.newSingleThreadExecutor();
        try {
            var oldStart = first.submit(begin(startup)::run);
            JSObject late = nextRequest(events);
            install(replacement, newEvents);
            var newStart = second.submit(begin(next)::run);
            resolve(nextRequest(newEvents));
            assertEquals("running", newStart.get(2, TimeUnit.SECONDS).getString("state"));
            resolve(late);
            oldStart.get(2, TimeUnit.SECONDS);
            FolioleCompanionSyncGroupProvider.pause(owner);
            FolioleCompanionSyncGroupDataBridge.uninstall(owner);
            assertEquals("running", FolioleCompanionSyncGroupProvider.state().getString("state"));
        } finally {
            first.shutdownNow();
            second.shutdownNow();
        }
    }

    @Test public void newerStartSurvivesStaleCredentialFailure() throws Exception {
        install(owner, events);
        var file = Executors.newSingleThreadExecutor();
        try {
            var superseded = file.submit(begin(startup)::run);
            JSObject late = nextRequest(events);
            var latest = file.submit(begin(startup)::run);
            var bridge = FolioleCompanionSyncGroupDataBridge.current();
            bridge.resolve(new JSObject().put(
                FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataResponseKey(context, "requestId"),
                bridge.eventId(late)
            ).put(FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataResponseKey(context, "error"),
                "superseded credential"));
            assertEquals("stopped", superseded.get(2, TimeUnit.SECONDS).getString("state"));
            resolve(nextRequest(events));
            assertEquals("running", latest.get(2, TimeUnit.SECONDS).getString("state"));
        } finally {
            file.shutdownNow();
        }
    }

    private FolioleCompanionSyncAsync.Work begin(FolioleCompanionSyncGroupProvider.Startup target) throws Exception {
        JSObject config = new JSObject()
            .put(key("group"), new JSObject().put("group_id", "provider-start-test").put("display_name", "Test"))
            .put(key("deviceId"), "provider-start-device").put(key("deviceName"), "Test device")
            .put(key("platform"), "android").put(key("appVersion"), "0.8.2");
        return target.begin(context, null, config, null, () -> {}, () -> true);
    }

    private String key(String name) throws Exception {
        return FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderRequestKey(context, name);
    }

    private void install(Object target, LinkedBlockingQueue<JSObject> requests) {
        FolioleCompanionSyncGroupDataBridge.install(context, target, requests::add);
    }

    private JSObject nextRequest(LinkedBlockingQueue<JSObject> requests) throws Exception {
        JSObject request = requests.poll(2, TimeUnit.SECONDS);
        assertNotNull(request);
        assertEquals("load_current_credential", request.getString(
            FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataRequestKey(context, "operation")));
        return request;
    }

    private void resolve(JSObject request) throws Exception {
        var response = new JSObject().put(
            FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataResponseKey(context, "requestId"),
            FolioleCompanionSyncGroupDataBridge.current().eventId(request)
        ).put(FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataResponseKey(context, "result"),
            new JSObject().put("device_id", "provider-start-device")
                .put("workgroup_key", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"));
        FolioleCompanionSyncGroupDataBridge.current().resolve(response);
    }
}
