package com.foliole.android;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.time.Instant;

@CapacitorPlugin(name = "FolioleCompanionBootstrap")
public class FolioleCompanionBootstrapPlugin extends Plugin {

    @PluginMethod
    public void loadBootstrap(PluginCall call) {
        try {
            FolioleCompanionBootstrapState state = new FolioleCompanionBootstrapState(
                getContext(), Instant.now().toString(), null, false
            );
            call.resolve(state.toJsObject());
        } catch (Exception exception) {
            call.reject("Failed to bootstrap Foliole companion runtime.", exception);
        }
    }
}
