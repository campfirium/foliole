package com.foliole.android;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleReadwiseToken")
public class FolioleReadwiseTokenPlugin extends Plugin {
    @PluginMethod
    public void loadReadwiseTokenConnection(PluginCall call) {
        FolioleReadwiseTokenPluginActions.loadConnection(getContext(), call);
    }

    @PluginMethod
    public void connectReadwiseToken(PluginCall call) {
        FolioleReadwiseTokenPluginActions.connect(getContext(), call);
    }

    @PluginMethod
    public void disconnectReadwiseToken(PluginCall call) {
        FolioleReadwiseTokenPluginActions.disconnect(getContext(), call);
    }
}
