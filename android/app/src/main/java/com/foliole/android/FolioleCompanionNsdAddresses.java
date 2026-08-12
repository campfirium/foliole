package com.foliole.android;

import android.net.nsd.NsdServiceInfo;
import android.os.Build;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class FolioleCompanionNsdAddresses {
    private FolioleCompanionNsdAddresses() {}

    static List<String> endpointHosts(NsdServiceInfo serviceInfo) {
        List<String> result = new ArrayList<>();
        for (InetAddress address : resolvedAddresses(serviceInfo)) {
            String host = endpointHost(address);
            if (host != null) result.add(host);
        }
        return result;
    }

    static String endpointHost(InetAddress address) {
        if (address == null) return null;
        String value = address.getHostAddress();
        if (value == null || value.isEmpty()) return null;
        return value.indexOf(':') >= 0 ? "[" + value + "]" : value;
    }

    @SuppressWarnings("deprecation")
    private static List<InetAddress> resolvedAddresses(NsdServiceInfo serviceInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            List<InetAddress> addresses = serviceInfo.getHostAddresses();
            if (!addresses.isEmpty()) return addresses;
        }
        InetAddress host = serviceInfo.getHost();
        return host == null ? Collections.emptyList() : Collections.singletonList(host);
    }
}
