package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import org.json.JSONObject;

final class FolioleCompanionNsdAdvertisement {
    private final NsdManager manager;
    private final NsdManager.RegistrationListener listener;

    private FolioleCompanionNsdAdvertisement(NsdManager manager, NsdManager.RegistrationListener listener) {
        this.manager = manager;
        this.listener = listener;
    }

    static FolioleCompanionNsdAdvertisement start(Context context, int port, JSONObject config) throws Exception {
        NsdManager manager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        if (manager == null) throw new IllegalStateException("Android NSD is unavailable.");
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(config.getJSONObject("sync_group").getString("display_name"));
        info.setServiceType(FolioleCompanionHostBridgeContractDefinitions.networkServiceType(context));
        info.setPort(port);
        put(info, "app_version", config.getString("app_version"));
        put(info, "group_id", config.getJSONObject("sync_group").getString("group_id"));
        put(info, "peer_id", config.getString("device_id"));
        put(info, "timeline_id", config.getJSONObject("sync_group").getString("timeline_id"));
        JSONObject protocol = config.getJSONObject("protocol");
        put(info, "protocol_version", String.valueOf(protocol.getInt("version")));
        put(info, "protocol_min_version", String.valueOf(protocol.getInt("min_supported_version")));
        put(info, "protocol_max_version", String.valueOf(protocol.getInt("max_supported_version")));
        put(info, "protocol_capabilities", join(protocol.getJSONArray("capabilities")));
        NsdManager.RegistrationListener listener = new NsdManager.RegistrationListener() {
            public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {}
            public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {}
            public void onServiceRegistered(NsdServiceInfo serviceInfo) {}
            public void onServiceUnregistered(NsdServiceInfo serviceInfo) {}
        };
        manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener);
        return new FolioleCompanionNsdAdvertisement(manager, listener);
    }

    void stop() {
        try { manager.unregisterService(listener); } catch (IllegalArgumentException ignored) {}
    }

    private static void put(NsdServiceInfo info, String key, String value) {
        info.setAttribute(key, value);
    }

    private static String join(org.json.JSONArray values) throws Exception {
        java.util.List<String> result = new java.util.ArrayList<>();
        for (int index = 0; index < values.length(); index++) result.add(values.getString(index));
        return String.join(",", result);
    }
}
