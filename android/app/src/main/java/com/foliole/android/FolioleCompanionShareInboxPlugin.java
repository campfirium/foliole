package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

@CapacitorPlugin(name = "FolioleCompanionShareInbox")
public class FolioleCompanionShareInboxPlugin extends Plugin {
    private static WeakReference<FolioleCompanionShareInboxPlugin> active = new WeakReference<>(null);

    @Override
    public void load() {
        active = new WeakReference<>(this);
    }

    static void notifyInboxChanged() {
        FolioleCompanionShareInboxPlugin plugin = active.get();
        if (plugin != null) plugin.notifyListeners("shareInboxChanged", new JSObject());
    }

    @PluginMethod
    public void loadPendingShares(PluginCall call) {
        try {
            call.resolve(new JSObject().put("items", FolioleCompanionShareInboxStore.load(getContext())));
        } catch (Exception error) {
            call.reject("Failed to load shared text.", error);
        }
    }

    @PluginMethod
    public void acknowledgeShare(PluginCall call) {
        String deliveryId = call.getString("delivery_id");
        if (deliveryId == null || deliveryId.isBlank()) {
            call.reject("A delivery_id is required.");
            return;
        }
        try {
            FolioleCompanionShareInboxStore.acknowledge(getContext(), deliveryId);
            call.resolve();
        } catch (Exception error) {
            call.reject("Failed to acknowledge shared text.", error);
        }
    }
}
