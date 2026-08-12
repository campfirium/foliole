package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import java.nio.charset.StandardCharsets;

final class FolioleCompanionNsdMonitor {
    private final NsdManager manager;
    private final Runnable onServiceHint;
    private final String serviceType;
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
    private void resolve(NsdServiceInfo service) {
        try {
            manager.resolveService(service, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo ignored, int errorCode) {}

                @Override public void onServiceResolved(NsdServiceInfo resolved) {
                    emitRemoteServiceHint(resolved);
                }
            });
        } catch (IllegalArgumentException ignored) {
        }
    }

    private void emitRemoteServiceHint(NsdServiceInfo service) {
        byte[] runtimeId = service.getAttributes().get("runtime_instance_id");
        String ownRuntimeId = FolioleCompanionSyncGroupProvider.runtimeInstanceId();
        if (runtimeId != null && !ownRuntimeId.isEmpty()
            && ownRuntimeId.equals(new String(runtimeId, StandardCharsets.UTF_8))) return;
        onServiceHint.run();
    }

    FolioleCompanionNsdMonitor(Context context, Runnable onServiceHint) throws Exception {
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
        try {
            manager.stopServiceDiscovery(listener);
        } catch (IllegalArgumentException ignored) {
        }
    }
}
