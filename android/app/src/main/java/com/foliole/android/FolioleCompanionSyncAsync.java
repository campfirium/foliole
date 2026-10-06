package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.concurrent.ExecutorService;

final class FolioleCompanionSyncAsync {
    private FolioleCompanionSyncAsync() {}

    static void run(ExecutorService executor, PluginCall call, String message, Work work) {
        executor.execute(() -> {
            try { call.resolve(work.run()); }
            catch (Exception exception) {
                call.reject(FolioleCompanionPluginErrors.withCause(message, exception), exception);
            }
        });
    }

    interface Work { JSObject run() throws Exception; }
}
