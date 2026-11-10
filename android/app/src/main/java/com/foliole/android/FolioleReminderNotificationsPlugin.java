package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleReminderNotifications")
public final class FolioleReminderNotificationsPlugin extends Plugin {
    @PluginMethod public void schedule(PluginCall call) {
        try {
            FolioleReminderAlarm.schedule(getContext(), call.getData());
            call.resolve();
        } catch (Exception error) { call.reject("Could not schedule reminder.", error); }
    }

    @PluginMethod public void list(PluginCall call) {
        try {
            call.resolve(new JSObject().put("jobs", FolioleReminderAlarm.jobs(getContext())));
        } catch (Exception error) { call.reject("Could not read reminder schedules.", error); }
    }

    @PluginMethod public void cancel(PluginCall call) {
        try {
            FolioleReminderAlarm.cancel(getContext(), call.getInt("id", -1));
            call.resolve();
        } catch (Exception error) { call.reject("Could not cancel reminder.", error); }
    }
}
