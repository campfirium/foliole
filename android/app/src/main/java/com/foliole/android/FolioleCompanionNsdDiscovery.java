package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class FolioleCompanionNsdDiscovery {
    private static final String SERVICE_TYPE = "_foliole-sync._tcp.";
    private static final int DISCOVERY_TIMEOUT_MS = 1500;

    private FolioleCompanionNsdDiscovery() {
    }

    public static List<String> discoverEndpointUrls(Context context) throws InterruptedException {
        NsdManager nsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        if (nsdManager == null) {
            return new ArrayList<>();
        }
        NsdCollector collector = new NsdCollector(nsdManager);
        collector.start();
        collector.await(DISCOVERY_TIMEOUT_MS);
        collector.stop();
        return collector.endpointUrls();
    }

    private static final class NsdCollector {
        private final NsdManager nsdManager;
        private final CountDownLatch discoveryStarted = new CountDownLatch(1);
        private final Object lock = new Object();
        private final Set<String> endpointUrls = new LinkedHashSet<>();
        private boolean stopped;

        private final NsdManager.DiscoveryListener discoveryListener = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String serviceType) {
                discoveryStarted.countDown();
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                if (SERVICE_TYPE.equals(serviceInfo.getServiceType())) {
                    resolve(serviceInfo);
                }
            }

            @Override
            public void onServiceLost(NsdServiceInfo serviceInfo) {
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
            }

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                stop();
                discoveryStarted.countDown();
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                stop();
            }
        };

        NsdCollector(NsdManager nsdManager) {
            this.nsdManager = nsdManager;
        }

        void start() {
            nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
        }

        void await(int timeoutMs) throws InterruptedException {
            discoveryStarted.await(timeoutMs, TimeUnit.MILLISECONDS);
            Thread.sleep(timeoutMs);
        }

        void stop() {
            synchronized (lock) {
                if (stopped) {
                    return;
                }
                stopped = true;
            }
            try {
                nsdManager.stopServiceDiscovery(discoveryListener);
            } catch (IllegalArgumentException ignored) {
            }
        }

        List<String> endpointUrls() {
            synchronized (lock) {
                return new ArrayList<>(endpointUrls);
            }
        }

        @SuppressWarnings("deprecation")
        private void resolve(NsdServiceInfo serviceInfo) {
            try {
                nsdManager.resolveService(serviceInfo, new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo serviceInfo) {
                        addResolvedEndpoint(serviceInfo);
                    }
                });
            } catch (IllegalArgumentException ignored) {
            }
        }

        private void addResolvedEndpoint(NsdServiceInfo serviceInfo) {
            InetAddress host = serviceInfo.getHost();
            int port = serviceInfo.getPort();
            if (host == null || port <= 0) {
                return;
            }
            String hostAddress = host.getHostAddress();
            if (hostAddress == null || hostAddress.indexOf(':') >= 0) {
                return;
            }
            synchronized (lock) {
                endpointUrls.add("http://" + hostAddress + ":" + port);
            }
        }
    }
}
