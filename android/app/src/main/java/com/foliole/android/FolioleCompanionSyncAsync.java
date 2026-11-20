package com.foliole.android;

import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.Set;
import java.util.concurrent.ExecutorService;

final class FolioleCompanionSyncAsync {
    // Support diagnostics separate executor queueing from file work for these calls only.
    private static final Set<String> TIMED_METHODS =
        Set.of("resolveAttachmentResource", "writeImageAttachment", "readRemoteImageResponse");

    private FolioleCompanionSyncAsync() {}

    static void run(ExecutorService executor, PluginCall call, String message, Work work) {
        long queuedAt = SystemClock.elapsedRealtime();
        executor.execute(() -> {
            long startedAt = SystemClock.elapsedRealtime();
            try { call.resolve(withExecutorTiming(call, work.run(), queuedAt, startedAt)); }
            catch (Exception exception) {
                call.reject(FolioleCompanionPluginErrors.withCause(message, exception), exception);
            }
        });
    }

    private static JSObject withExecutorTiming(PluginCall call, JSObject result, long queuedAt, long startedAt) {
        if (result == null || !TIMED_METHODS.contains(call.getMethodName())) return result;
        JSObject timing = new JSObject();
        timing.put("queue_ms", startedAt - queuedAt);
        timing.put("run_ms", SystemClock.elapsedRealtime() - startedAt);
        result.put("executor_timing", timing);
        return result;
    }

    interface Work { JSObject run() throws Exception; }
}
