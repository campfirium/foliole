package com.foliole.android;

import android.content.Context;

import com.getcapacitor.PluginCall;

final class FolioleReadwiseTokenPluginActions {
    private FolioleReadwiseTokenPluginActions() {}

    static void loadConnection(Context context, PluginCall call) {
        try {
            call.resolve(FolioleReadwiseTokenStore.loadConnection(context));
        } catch (Exception exception) {
            call.reject("Failed to load Readwise connection.", exception);
        }
    }

    static void connect(Context context, PluginCall call) {
        try {
            String token = call.getString("token");
            call.resolve(FolioleReadwiseTokenStore.connect(context, token));
        } catch (Exception exception) {
            call.reject("Failed to connect Readwise.", exception);
        }
    }

    static void disconnect(Context context, PluginCall call) {
        try {
            call.resolve(FolioleReadwiseTokenStore.disconnect(context));
        } catch (Exception exception) {
            call.reject("Failed to disconnect Readwise.", exception);
        }
    }
}
