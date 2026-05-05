package com.foliole.android;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionBootstrap")
public class FolioleCompanionBootstrapPlugin extends Plugin {

    @PluginMethod
    public void loadBootstrap(PluginCall call) {
        FolioleCompanionDatabaseHelper databaseHelper = new FolioleCompanionDatabaseHelper(getContext());
        try {
            FolioleCompanionBootstrapState state = databaseHelper.loadBootstrapState(getContext());
            call.resolve(state.toJsObject());
        } catch (Exception exception) {
            call.reject("Failed to bootstrap Foliole companion runtime.", exception);
        } finally {
            databaseHelper.close();
        }
    }
}
