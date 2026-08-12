package com.foliole.android;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import com.getcapacitor.JSObject;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class FolioleCompanionNsdDiscovery {
    private FolioleCompanionNsdDiscovery() {
    }

    public static List<JSObject> discoverCandidates(Context context) throws Exception {
        NsdManager nsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        if (nsdManager == null) {
            return new ArrayList<>();
        }
        NsdCollector collector = new NsdCollector(
            context,
            nsdManager,
            qualifiedServiceType(
                FolioleCompanionHostBridgeContractDefinitions.networkServiceType(context)
            )
        );
        collector.start();
        collector.await(FolioleCompanionHostBridgeContractDefinitions.networkDiscoveryTimeoutMs(context));
        collector.stop();
        return collector.candidates();
    }

    static boolean sameServiceType(String requested, String discovered) {
        return normalizeServiceType(requested).equalsIgnoreCase(normalizeServiceType(discovered));
    }

    static String qualifiedServiceType(String serviceType) {
        String normalized = normalizeServiceType(serviceType);
        return normalized.isEmpty() ? normalized : normalized + ".";
    }

    private static String normalizeServiceType(String serviceType) {
        if (serviceType == null || serviceType.isEmpty()) {
            return "";
        }
        return serviceType.endsWith(".")
            ? serviceType.substring(0, serviceType.length() - 1)
            : serviceType;
    }

    private static final class NsdCollector {
        private final Context context;
        private final NsdManager nsdManager;
        private final String serviceType;
        private final CountDownLatch discoveryStarted = new CountDownLatch(1);
        private final Object lock = new Object();
        private final Set<String> endpointUrls = new LinkedHashSet<>();
        private final List<JSObject> candidates = new ArrayList<>();
        private boolean stopped;

        private final NsdManager.DiscoveryListener discoveryListener = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String serviceType) {
                discoveryStarted.countDown();
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                if (sameServiceType(serviceType, serviceInfo.getServiceType())) {
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

        NsdCollector(Context context, NsdManager nsdManager, String serviceType) {
            this.context = context;
            this.nsdManager = nsdManager;
            this.serviceType = serviceType;
        }

        void start() {
            nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
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

        List<JSObject> candidates() {
            synchronized (lock) {
                return new ArrayList<>(candidates);
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
            try {
                if (ownRuntimeInstance(serviceInfo)) return;
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
                    String endpointUrl = FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrl(context, hostAddress, port);
                    if (!endpointUrls.add(endpointUrl)) {
                        return;
                    }
                    JSObject candidate = new JSObject();
                    candidate.put(FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrlCandidateKey(context), endpointUrl);
                    candidate.put(FolioleCompanionHostBridgeContractDefinitions.networkSourceCandidateKey(context), "nsd");
                    candidate.put(
                        FolioleCompanionHostBridgeContractDefinitions.networkProtocolTxtCandidateKey(context),
                        readProtocolTxt(serviceInfo)
                    );
                    candidates.add(candidate);
                }
            } catch (Exception ignored) {
            }
        }

        private boolean ownRuntimeInstance(NsdServiceInfo serviceInfo) {
            byte[] value = serviceInfo.getAttributes().get("runtime_instance_id");
            if (value == null) return false;
            return FolioleCompanionSyncGroupProvider.runtimeInstanceId().equals(
                new String(value, StandardCharsets.UTF_8)
            );
        }

        private JSObject readProtocolTxt(NsdServiceInfo serviceInfo) throws Exception {
            JSObject result = new JSObject();
            copyTxtAttribute(serviceInfo, result, "capabilities");
            copyTxtAttribute(serviceInfo, result, "maxSupportedVersion");
            copyTxtAttribute(serviceInfo, result, "minSupportedVersion");
            copyTxtAttribute(serviceInfo, result, "version");
            return result;
        }

        private void copyTxtAttribute(NsdServiceInfo serviceInfo, JSObject result, String contractKey) throws Exception {
            String txtKey = FolioleCompanionHostBridgeContractDefinitions.networkProtocolTxtKey(context, contractKey);
            byte[] value = serviceInfo.getAttributes().get(txtKey);
            if (value != null) {
                result.put(txtKey, new String(value, StandardCharsets.UTF_8));
            }
        }
    }
}
