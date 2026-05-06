package com.foliole.android;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionAppData")
public class FolioleCompanionAppDataPlugin extends Plugin {

    @PluginMethod
    public void clearAppData(PluginCall call) {
        new Thread(() -> {
            try {
                call.resolve(FolioleCompanionAppDataStore.clear(getContext().getApplicationContext()));
            } catch (Exception exception) {
                call.reject(FolioleCompanionPluginErrors.withCause("Failed to clear Foliole app data.", exception), exception);
            }
        }).start();
    }
}
