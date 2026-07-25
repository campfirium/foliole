package com.foliole.android;

import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionAlternative")
public class FolioleCompanionAlternativePlugin extends FolioleCompanionDatabasePlugin {
    @PluginMethod
    public void load(PluginCall call) {
        resolveWithDatabase(call, "Failed to load the alternate text.", helper ->
            FolioleCompanionNodeTextAlternativeStore.load(
                getContext(), helper.getReadableDatabase(), call.getString("node_id", "")
            ));
    }

    @PluginMethod
    public void updateStatus(PluginCall call) {
        resolveWithDatabase(call, "Failed to update the alternate text.", helper ->
            FolioleCompanionNodeTextAlternativeStore.updateStatus(
                getContext(), helper.getWritableDatabase(),
                call.getString("alternative_id", ""),
                call.getString("status", ""),
                call.getString("updated_at", "")
            ));
    }
}
