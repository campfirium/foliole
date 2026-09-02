package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;

final class FolioleCompanionNsdDiscoverySession {
    interface Listener { void onEvent(JSObject event); }

    private final Context context;
    private final Listener listener;
    private final NsdManager manager;
    private final WifiManager.MulticastLock multicastLock;
    private final String serviceType;
    private final Map<String, JSObject> candidates = new LinkedHashMap<>();
    private final Deque<NsdServiceInfo> pendingResolutions = new ArrayDeque<>();
    private long discoveryGeneration;
    private boolean resolving;
    private boolean started;

    FolioleCompanionNsdDiscoverySession(Context context, Listener listener) throws Exception {
        this.context = context;
        this.listener = listener;
        manager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        WifiManager wifiManager = (WifiManager) context.getApplicationContext()
            .getSystemService(Context.WIFI_SERVICE);
        multicastLock = wifiManager == null ? null
            : wifiManager.createMulticastLock("foliole-sync-discovery-session");
        if (multicastLock != null) multicastLock.setReferenceCounted(false);
        serviceType = FolioleCompanionNsdDiscovery.qualifiedServiceType(
            FolioleCompanionHostBridgeContractDefinitions.networkServiceType(context));
    }

    private final NsdManager.DiscoveryListener discovery = new NsdManager.DiscoveryListener() {
        @Override public void onDiscoveryStarted(String type) { emit("started", "searching", null); }
        @Override public void onServiceFound(NsdServiceInfo service) {
            if (FolioleCompanionNsdDiscovery.sameServiceType(serviceType, service.getServiceType())) resolve(service);
        }
        @Override public void onServiceLost(NsdServiceInfo service) {
            removeServiceCandidates(service.getServiceName());
            emit("lost", candidates.isEmpty() ? "searching" : "results", null);
        }
        @Override public void onDiscoveryStopped(String type) {
            started = false;
            releaseMulticastLock();
            emit("stopped", "stopped", null);
        }
        @Override public void onStartDiscoveryFailed(String type, int code) {
            started = false;
            releaseMulticastLock();
            emit("failed", "unavailable", "nsd_start_" + code);
        }
        @Override public void onStopDiscoveryFailed(String type, int code) {
            started = false;
            releaseMulticastLock();
            emit("failed", "unavailable", "nsd_stop_" + code);
        }
    };

    JSObject start() {
        stop(false);
        if (manager == null) return emit("failed", "unavailable", "nsd_unavailable");
        started = true;
        try {
            if (multicastLock != null && !multicastLock.isHeld()) multicastLock.acquire();
            manager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discovery);
            return event("started", "searching", null);
        } catch (SecurityException error) {
            started = false;
            releaseMulticastLock();
            return emit("failed", "permission_required", "local_network_permission");
        } catch (RuntimeException error) {
            started = false;
            releaseMulticastLock();
            return emit("failed", "unavailable", "nsd_unavailable");
        }
    }

    JSObject stop() { return stop(true); }

    private JSObject stop(boolean publish) {
        if (started && manager != null) {
            started = false;
            try { manager.stopServiceDiscovery(discovery); }
            catch (IllegalArgumentException | SecurityException ignored) {}
        }
        synchronized (pendingResolutions) {
            discoveryGeneration += 1;
            pendingResolutions.clear();
        }
        synchronized (candidates) { candidates.clear(); }
        releaseMulticastLock();
        return publish ? emit("stopped", "stopped", null) : event("stopped", "stopped", null);
    }

    private void releaseMulticastLock() {
        if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
    }

    @SuppressWarnings("deprecation")
    private void resolve(NsdServiceInfo service) {
        synchronized (pendingResolutions) {
            if (!started) return;
            pendingResolutions.addLast(service);
            if (resolving) return;
            resolving = true;
        }
        resolveNext();
    }

    @SuppressWarnings("deprecation")
    private void resolveNext() {
        NsdServiceInfo service;
        long resolutionGeneration;
        synchronized (pendingResolutions) {
            service = started ? pendingResolutions.pollFirst() : null;
            if (service == null) {
                resolving = false;
                return;
            }
            resolutionGeneration = discoveryGeneration;
        }
        try {
            manager.resolveService(service, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo ignored, int code) {
                    if (isCurrent(resolutionGeneration)) {
                        emit("failed", "unavailable", "nsd_resolve_" + code);
                    }
                    resolveNext();
                }
                @Override public void onServiceResolved(NsdServiceInfo resolved) {
                    if (isCurrent(resolutionGeneration)) add(resolved);
                    resolveNext();
                }
            });
        } catch (IllegalArgumentException error) {
            if (isCurrent(resolutionGeneration)) {
                emit("failed", "unavailable", "nsd_resolve_unavailable");
            }
            resolveNext();
        }
    }

    private boolean isCurrent(long resolutionGeneration) {
        synchronized (pendingResolutions) {
            return started && discoveryGeneration == resolutionGeneration;
        }
    }

    private void add(NsdServiceInfo service) {
        try {
            byte[] own = service.getAttributes().get("runtime_instance_id");
            if (own != null && FolioleCompanionSyncGroupProvider.runtimeInstanceId().equals(
                new String(own, StandardCharsets.UTF_8))) return;
            Map<String, JSObject> resolved = FolioleCompanionNsdServiceCandidates.create(
                context, service, protocol(service)
            );
            boolean changed;
            synchronized (candidates) {
                changed = removeServiceCandidatesLocked(service.getServiceName());
                candidates.putAll(resolved);
            }
            emit(changed ? "changed" : "found", "results", null);
        } catch (Exception contractError) {
            emit("failed", "unavailable", "nsd_candidate_invalid");
        }
    }

    private void removeServiceCandidates(String serviceName) {
        synchronized (candidates) { removeServiceCandidatesLocked(serviceName); }
    }

    private boolean removeServiceCandidatesLocked(String serviceName) {
        return candidates.keySet().removeIf(
            key -> FolioleCompanionNsdServiceCandidates.belongsToService(key, serviceName)
        );
    }

    private JSObject protocol(NsdServiceInfo service) throws Exception {
        JSObject result = new JSObject();
        for (String name : new String[] {"maxSupportedVersion", "minSupportedVersion", "version"}) {
            String key = FolioleCompanionHostBridgeContractDefinitions.networkProtocolTxtKey(context, name);
            byte[] value = service.getAttributes().get(key);
            if (value != null) result.put(key, new String(value, StandardCharsets.UTF_8));
        }
        return result;
    }

    private JSObject emit(String change, String status, String error) {
        JSObject value = event(change, status, error);
        listener.onEvent(value);
        return value;
    }

    private JSObject event(String change, String status, String error) {
        JSObject value = new JSObject();
        value.put("change", change); value.put("status", status); value.put("error_code", error);
        JSArray values = new JSArray();
        synchronized (candidates) { candidates.values().forEach(values::put); }
        try {
            value.put(FolioleCompanionHostBridgeContractDefinitions.networkCandidatesResponseKey(context), values);
        } catch (Exception contractError) {
            value.put("candidates", values);
            value.put("status", "unavailable");
            value.put("error_code", "bridge_contract_unavailable");
        }
        return value;
    }
}
