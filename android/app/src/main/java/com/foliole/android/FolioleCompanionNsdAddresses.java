package com.foliole.android;

import android.net.nsd.NsdServiceInfo;
import android.os.Build;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class FolioleCompanionNsdAddresses {
    private FolioleCompanionNsdAddresses() {}

    static List<String> endpointHosts(NsdServiceInfo serviceInfo) {
        Set<String> result = new LinkedHashSet<>();
        for (InetAddress address : resolvedAddresses(serviceInfo)) {
            String host = endpointHost(address);
            if (host != null) result.add(host);
        }
        result.addAll(advertisedIpv4Hosts(serviceInfo.getAttributes().get("ipv4_addresses")));
        return new ArrayList<>(result);
    }

    static List<String> advertisedIpv4Hosts(byte[] attribute) {
        if (attribute == null) return Collections.emptyList();
        List<String> result = new ArrayList<>();
        for (String value : new String(attribute, StandardCharsets.UTF_8).split(",")) {
            String candidate = value.trim();
            if (isIpv4(candidate)) result.add(candidate);
        }
        return result;
    }

    static String endpointHost(InetAddress address) {
        if (address == null) return null;
        String value = address.getHostAddress();
        if (value == null || value.isEmpty()) return null;
        return value.indexOf(':') >= 0 ? "[" + value + "]" : value;
    }

    private static boolean isIpv4(String value) {
        String[] parts = value.split("\\.", -1);
        if (parts.length != 4) return false;
        for (String part : parts) {
            if (part.isEmpty() || part.length() > 3 || !part.chars().allMatch(Character::isDigit)) return false;
            int number = Integer.parseInt(part);
            if (number > 255 || (part.length() > 1 && part.charAt(0) == '0')) return false;
        }
        return true;
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
