package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class FolioleCompanionNsdAdvertisement {
    private final NsdManager manager;
    private final NsdManager.RegistrationListener listener;
    private final CountDownLatch unregistered = new CountDownLatch(1);
    private volatile int errorCode;
    private volatile String state = "registering";

    private FolioleCompanionNsdAdvertisement(NsdManager manager, NsdManager.RegistrationListener listener) {
        this.manager = manager;
        this.listener = listener;
    }

    static FolioleCompanionNsdAdvertisement start(Context context, int port, JSONObject config) throws Exception {
        NsdManager manager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        if (manager == null) throw new IllegalStateException("Android NSD is unavailable.");
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(serviceInstanceName(config));
        info.setServiceType(FolioleCompanionNsdDiscovery.qualifiedServiceType(
            FolioleCompanionHostBridgeContractDefinitions.networkServiceType(context)
        ));
        info.setPort(port);
        put(info, "app_version", config.getString("app_version"));
        put(info, "facts_revision", config.getString("facts_revision"));
        put(info, "group_id", config.getJSONObject("sync_group").getString("group_id"));
        put(info, "group_tag", config.getString("group_tag"));
        put(info, "group_display_name", config.getJSONObject("sync_group").getString("display_name"));
        put(info, "peer_id", config.getString("device_id"));
        put(info, "runtime_instance_id", config.getString("runtime_instance_id"));
        put(info, "timeline_id", config.getJSONObject("sync_group").getString("timeline_id"));
        JSONObject protocol = config.getJSONObject("protocol");
        put(info, "protocol_version", String.valueOf(protocol.getInt("version")));
        put(info, "protocol_min_version", String.valueOf(protocol.getInt("min_supported_version")));
        put(info, "protocol_max_version", String.valueOf(protocol.getInt("max_supported_version")));
        put(info, "protocol_capabilities", join(protocol.getJSONArray("capabilities")));
        AtomicReference<FolioleCompanionNsdAdvertisement> active = new AtomicReference<>();
        NsdManager.RegistrationListener listener = new NsdManager.RegistrationListener() {
            public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                active.get().failed(errorCode);
            }
            public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                active.get().failed(errorCode);
                active.get().unregistered.countDown();
            }
            public void onServiceRegistered(NsdServiceInfo serviceInfo) {
                active.get().state = "registered";
            }
            public void onServiceUnregistered(NsdServiceInfo serviceInfo) {
                active.get().state = "unregistered";
                active.get().unregistered.countDown();
            }
        };
        FolioleCompanionNsdAdvertisement advertisement =
            new FolioleCompanionNsdAdvertisement(manager, listener);
        active.set(advertisement);
        manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener);
        return advertisement;
    }

    void stop() {
        try { manager.unregisterService(listener); } catch (IllegalArgumentException ignored) {}
    }

    void stopAndAwait() throws Exception {
        stop();
        if (!unregistered.await(5, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Android NSD advertisement did not unregister.");
        }
        if ("failed".equals(state)) throw new IllegalStateException("Android NSD advertisement unregister failed.");
    }

    int errorCode() { return errorCode; }

    String state() { return state; }

    private void failed(int code) {
        errorCode = code;
        state = "failed";
    }

    private static void put(NsdServiceInfo info, String key, String value) {
        info.setAttribute(key, value);
    }

    private static String serviceInstanceName(JSONObject config) throws Exception {
        String displayName = config.getJSONObject("sync_group").getString("display_name");
        String runtime = config.getString("runtime_instance_id").replaceAll("[^A-Za-z0-9]", "");
        String runtimeSuffix = runtime.isEmpty() ? "runtime" : runtime.substring(0, Math.min(8, runtime.length()));
        String revision = Integer.toUnsignedString(config.getString("facts_revision").hashCode(), 36);
        String suffix = runtimeSuffix + "-" + revision;
        int displayLimit = Math.max(1, 62 - suffix.length());
        return displayName.substring(0, Math.min(displayName.length(), displayLimit)) + "-" + suffix;
    }

    private static String join(org.json.JSONArray values) throws Exception {
        java.util.List<String> result = new java.util.ArrayList<>();
        for (int index = 0; index < values.length(); index++) result.add(values.getString(index));
        return String.join(",", result);
    }
}
