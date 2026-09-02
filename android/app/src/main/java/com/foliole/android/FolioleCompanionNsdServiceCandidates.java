package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdServiceInfo;

import com.getcapacitor.JSObject;

import java.util.LinkedHashMap;
import java.util.Map;

final class FolioleCompanionNsdServiceCandidates {
    private static final String KEY_SEPARATOR = "\n";

    private FolioleCompanionNsdServiceCandidates() {}

    static Map<String, JSObject> create(
        Context context,
        NsdServiceInfo service,
        JSObject protocol
    ) throws Exception {
        Map<String, JSObject> candidates = new LinkedHashMap<>();
        for (String host : FolioleCompanionNsdAddresses.endpointHosts(service)) {
            String endpointUrl = FolioleCompanionHostBridgeContractDefinitions
                .networkEndpointUrl(context, host, service.getPort());
            JSObject candidate = new JSObject();
            candidate.put(FolioleCompanionHostBridgeContractDefinitions
                .networkEndpointUrlCandidateKey(context), endpointUrl);
            candidate.put(FolioleCompanionHostBridgeContractDefinitions
                .networkSourceCandidateKey(context), "nsd");
            candidate.put(FolioleCompanionHostBridgeContractDefinitions
                .networkProtocolTxtCandidateKey(context), protocol);
            candidates.put(key(service.getServiceName(), endpointUrl), candidate);
        }
        if (candidates.isEmpty()) throw new IllegalStateException("NSD address unavailable");
        return candidates;
    }

    static boolean belongsToService(String key, String serviceName) {
        return key.startsWith(serviceName + KEY_SEPARATOR);
    }

    private static String key(String serviceName, String endpointUrl) {
        return serviceName + KEY_SEPARATOR + endpointUrl;
    }
}
