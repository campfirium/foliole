package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;

final class FolioleCompanionNsdMonitor {
    interface HintListener { void onServiceHint(JSObject hint); }

    private final Context context;
    private final NsdManager manager;
    private final HintListener onServiceHint;
    private final String serviceType;
    private final Deque<NsdServiceInfo> pendingResolutions = new ArrayDeque<>();
    private boolean resolving;
    private boolean started;

    private final NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
        @Override public void onDiscoveryStarted(String type) {}

        @Override public void onServiceFound(NsdServiceInfo service) {
            if (!FolioleCompanionNsdDiscovery.sameServiceType(serviceType, service.getServiceType())) return;
            resolve(service);
        }

        @Override public void onServiceLost(NsdServiceInfo service) {}
        @Override public void onDiscoveryStopped(String type) {}

        @Override public void onStartDiscoveryFailed(String type, int errorCode) {
            started = false;
        }

        @Override public void onStopDiscoveryFailed(String type, int errorCode) {
            started = false;
        }
    };

    @SuppressWarnings("deprecation")
    private synchronized void resolve(NsdServiceInfo service) {
        pendingResolutions.addLast(service);
        if (resolving) return;
        resolving = true;
        resolveNext();
    }

    @SuppressWarnings("deprecation")
    private synchronized void resolveNext() {
        NsdServiceInfo service = pendingResolutions.pollFirst();
        if (service == null) { resolving = false; return; }
        try {
            manager.resolveService(service, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo ignored, int errorCode) {
                    resolveNext();
                }

                @Override public void onServiceResolved(NsdServiceInfo resolved) {
                    if (started) emitRemoteServiceHint(resolved);
                    resolveNext();
                }
            });
        } catch (IllegalArgumentException ignored) {
            resolveNext();
        }
    }

    private void emitRemoteServiceHint(NsdServiceInfo service) {
        byte[] runtimeId = service.getAttributes().get("runtime_instance_id");
        String ownRuntimeId = FolioleCompanionSyncGroupProvider.runtimeInstanceId();
        if (runtimeId != null && !ownRuntimeId.isEmpty()
            && ownRuntimeId.equals(new String(runtimeId, StandardCharsets.UTF_8))) return;
        try {
            int port = service.getPort();
            if (port <= 0) return;
            for (String host : FolioleCompanionNsdAddresses.endpointHosts(service)) {
                JSObject hint = new JSObject();
                hint.put(FolioleCompanionHostBridgeContractDefinitions
                    .syncGroupProviderServiceHintKey(context, "endpointUrl"),
                    FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrl(context, host, port));
                onServiceHint.onServiceHint(hint);
            }
        } catch (Exception ignored) {}
    }

    FolioleCompanionNsdMonitor(Context context, HintListener onServiceHint) throws Exception {
        this.context = context;
        manager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        serviceType = FolioleCompanionNsdDiscovery.qualifiedServiceType(
            FolioleCompanionHostBridgeContractDefinitions.networkServiceType(context)
        );
        this.onServiceHint = onServiceHint;
    }

    synchronized void start() {
        if (started || manager == null) return;
        started = true;
        try {
            manager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, listener);
        } catch (RuntimeException error) {
            started = false;
        }
    }

    synchronized void stop() {
        if (!started || manager == null) return;
        started = false;
        pendingResolutions.clear();
        try {
            manager.stopServiceDiscovery(listener);
        } catch (IllegalArgumentException ignored) {
        }
    }
}
