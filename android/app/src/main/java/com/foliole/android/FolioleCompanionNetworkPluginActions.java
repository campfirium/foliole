package com.foliole.android;

import android.content.Context;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONArray;

final class FolioleCompanionNetworkPluginActions {
    private static final String DISCOVERY_LOG_TAG = "FolioleSyncDiscovery";

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
                Log.d(DISCOVERY_LOG_TAG, "Candidate request started");
                JSArray candidates = new JSArray();
                java.util.List<String> endpoints =
                    FolioleCompanionSyncGroupOutboundPeerStore.discoveryEndpointUrls(context);
                Log.d(DISCOVERY_LOG_TAG, "Stored route candidates=" + endpoints.size());
                for (String endpointUrl : endpoints) {
                    addDirectEndpointCandidate(context, candidates, endpointUrl);
                }
                if (isEmulator(context)) {
                    addDirectHostCandidate(context, candidates,
                        FolioleCompanionHostBridgeContractDefinitions.networkEmulatorHost(context));
                }
                java.util.List<JSObject> discovered = FolioleCompanionNsdDiscovery.discoverCandidates(context);
                Log.d(DISCOVERY_LOG_TAG, "NSD candidates=" + discovered.size());
                for (JSObject candidate : discovered) {
                    candidates.put(candidate);
                }
                JSObject result = new JSObject();
                result.put(FolioleCompanionHostBridgeContractDefinitions.networkCandidatesResponseKey(context), candidates);
                call.resolve(result);
                Log.d(DISCOVERY_LOG_TAG, "Candidate request resolved total=" + candidates.length());
            } catch (Exception exception) {
                Log.w(DISCOVERY_LOG_TAG,
                    "Candidate request rejected: " + exception.getClass().getSimpleName());
                call.reject(FolioleCompanionPluginErrors.withCause("Failed to load companion discovery candidates.", exception), exception);
            }
        }).start();
    }

    private static void addDirectHostCandidate(Context context, JSArray candidates, String hostAddress) throws Exception {
        addDirectEndpointCandidate(context, candidates,
            FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrl(context, hostAddress));
    }

    private static void addDirectEndpointCandidate(Context context, JSArray candidates, String endpointUrl) throws Exception {
        JSObject candidate = new JSObject();
        candidate.put(
            FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrlCandidateKey(context),
            endpointUrl
        );
        candidate.put(FolioleCompanionHostBridgeContractDefinitions.networkSourceCandidateKey(context), "direct");
        candidates.put(candidate);
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
