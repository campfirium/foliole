package com.foliole.android;

import android.os.SystemClock;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

final class FolioleTimedPluginCall extends PluginCall {
    private final CountDownLatch completed = new CountDownLatch(1);
    private final long submitted = SystemClock.elapsedRealtimeNanos();
    private volatile long started;
    private volatile long ended;
    private volatile String thread;
    private volatile String failure;
    private JSObject response;

    private FolioleTimedPluginCall(String plugin, String method, JSObject data) {
        super(null, plugin, "queue-measurement", method, data);
    }

    static FolioleTimedPluginCall submit(Bridge bridge, String plugin, String method, JSObject data) {
        FolioleTimedPluginCall call = new FolioleTimedPluginCall(plugin, method, data);
        bridge.callPluginMethod(plugin, method, call);
        return call;
    }

    private void begin() {
        if (started != 0) return;
        started = SystemClock.elapsedRealtimeNanos();
        thread = Thread.currentThread().getName();
    }

    @Override public String getString(String key) { begin(); return super.getString(key); }
    @Override public String getString(String key, String fallback) { begin(); return super.getString(key, fallback); }
    @Override public void resolve(JSObject value) {
        response = value;
        ended = SystemClock.elapsedRealtimeNanos();
        completed.countDown();
    }
    @Override public void resolve() { resolve(new JSObject()); }
    @Override public void reject(String message, String code, Exception error, JSObject value) {
        failure = message;
        resolve(value);
    }
    @Override public void errorCallback(String message) { failure = message; resolve(); }

    JSObject await() throws Exception {
        if (!completed.await(60, TimeUnit.SECONDS)) throw new IllegalStateException("Plugin measurement timed out: " + getMethodName());
        if (failure != null) throw new IllegalStateException(failure);
        if (started == 0) throw new IllegalStateException("Plugin measurement did not observe argument consumption");
        return response;
    }

    JSONObject measurement() throws Exception {
        await();
        return new JSONObject().put("method", getMethodName()).put("thread", thread)
            .put("queueMs", (started - submitted) / 1_000_000.0)
            .put("executionMs", (ended - started) / 1_000_000.0)
            .put("totalMs", (ended - submitted) / 1_000_000.0);
    }
}
