package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.util.function.BiConsumer;

/** Lands the renderer's background-work calls on the dataSync foreground service. */
final class FolioleCompanionSyncBackgroundActions {
    private FolioleCompanionSyncBackgroundActions() {}

    static void listen(BiConsumer<String, JSObject> notify) {
        FolioleCompanionSyncBackgroundWork.listen(reason ->
            notify.accept("syncBackgroundWorkEnded", new JSObject().put("reason", reason)));
    }

    static void begin(Context context, PluginCall call) {
        try {
            FolioleCompanionSyncBackgroundWork.begin(context, call.getString("title", ""),
                call.getString("text", ""), call.getString("channel_name", ""));
            call.resolve();
        } catch (Exception error) { call.reject("Sync background work is unavailable.", error); }
    }

    static void update(Context context, PluginCall call) {
        FolioleCompanionSyncBackgroundWork.update(context, call.getString("title", ""), call.getString("text", ""),
            call.getInt("completed", -1), call.getInt("total", -1));
        call.resolve();
    }

    static void end(PluginCall call) {
        FolioleCompanionSyncBackgroundWork.end();
        call.resolve();
    }
}
