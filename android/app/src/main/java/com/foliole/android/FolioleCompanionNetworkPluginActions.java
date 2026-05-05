package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionNetworkPluginActions {
    private FolioleCompanionNetworkPluginActions() {}

    static void desktopHttpRequest(Context context, PluginCall call) {
        new Thread(() -> {
            try {
                String urlKey = requestKey(context, "url");
                String methodKey = requestKey(context, "method");
                String url = call.getString(urlKey);
                String method = call.getString(methodKey);
                if (url == null || url.trim().isEmpty()) {
                    call.reject(urlKey + " is required.");
                    return;
                }
                if (method == null || method.trim().isEmpty()) {
                    call.reject(methodKey + " is required.");
                    return;
                }
                call.resolve(FolioleCompanionDesktopHttpClient.request(
                    context,
                    url,
                    method,
                    call.getData().optJSONObject(requestKey(context, "headers")),
                    call.getString(requestKey(context, "body"))
                ));
            } catch (Exception exception) {
                call.reject("Desktop HTTP request failed.", exception);
            }
        }).start();
    }

    static void loadDiscoveryCandidates(Context context, PluginCall call) {
        new Thread(() -> {
            try {
                JSArray endpointUrls = new JSArray();
                addEndpoint(endpointUrls, "10.0.2.2");
                for (String endpointUrl : FolioleCompanionNsdDiscovery.discoverEndpointUrls(context)) {
                    endpointUrls.put(endpointUrl);
                }
                JSObject result = new JSObject();
                result.put(discoveryResponseKey(context, "endpointUrls"), endpointUrls);
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Failed to load companion discovery candidates.", exception);
            }
        }).start();
    }

    private static void addEndpoint(JSArray endpointUrls, String hostAddress) {
        endpointUrls.put("http://" + hostAddress + ":38641");
    }

    private static String discoveryResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.networkDiscoveryResponseKey(context, key);
    }

    private static String requestKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.networkRequestKey(context, key);
    }
}
