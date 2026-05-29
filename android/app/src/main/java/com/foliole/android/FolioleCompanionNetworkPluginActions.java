package com.foliole.android;

import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONArray;

final class FolioleCompanionNetworkPluginActions {
    private FolioleCompanionNetworkPluginActions() {}

    static void desktopHttpRequest(Context context, PluginCall call) {
        new Thread(() -> {
            try {
                String urlKey = FolioleCompanionHostBridgeContractDefinitions.networkUrlRequestKey(context);
                String methodKey = FolioleCompanionHostBridgeContractDefinitions.networkMethodRequestKey(context);
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
                    call.getData().optJSONObject(FolioleCompanionHostBridgeContractDefinitions.networkHeadersRequestKey(context)),
                    call.getString(FolioleCompanionHostBridgeContractDefinitions.networkBodyRequestKey(context))
                ));
            } catch (Exception exception) {
                call.reject(FolioleCompanionPluginErrors.withCause("Desktop HTTP request failed.", exception), exception);
            }
        }).start();
    }

    static void loadDiscoveryCandidates(Context context, PluginCall call) {
        new Thread(() -> {
            try {
                JSArray endpointUrls = new JSArray();
                if (isEmulator(context)) {
                    addEndpoint(context, endpointUrls, FolioleCompanionHostBridgeContractDefinitions.networkEmulatorHost(context));
                }
                for (String endpointUrl : FolioleCompanionNsdDiscovery.discoverEndpointUrls(context)) {
                    endpointUrls.put(endpointUrl);
                }
                JSObject result = new JSObject();
                result.put(FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrlsResponseKey(context), endpointUrls);
                call.resolve(result);
            } catch (Exception exception) {
                call.reject(FolioleCompanionPluginErrors.withCause("Failed to load companion discovery candidates.", exception), exception);
            }
        }).start();
    }

    private static void addEndpoint(Context context, JSArray endpointUrls, String hostAddress) throws Exception {
        endpointUrls.put(FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrl(context, hostAddress));
    }

    private static boolean isEmulator(Context context) throws Exception {
        String model = Build.MODEL == null ? "" : Build.MODEL.trim().toLowerCase();
        JSONArray emulatorTokens = FolioleCompanionHostBridgeContractDefinitions.bootstrapEmulatorModelTokens(context);
        for (int index = 0; index < emulatorTokens.length(); index += 1) {
            if (model.contains(emulatorTokens.getString(index))) {
                return true;
            }
        }
        return false;
    }
}
