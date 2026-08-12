package com.foliole.android;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.net.InetAddress;
import java.net.Inet6Address;

import org.junit.Test;

public class FolioleCompanionNsdDiscoveryTest {
    @Test
    public void qualifiesServiceTypeForAndroidNsd() {
        assertEquals("_foliole-sync._tcp.", FolioleCompanionNsdDiscovery.qualifiedServiceType(
            "_foliole-sync._tcp"
        ));
        assertEquals("_foliole-sync._tcp.", FolioleCompanionNsdDiscovery.qualifiedServiceType(
            "_foliole-sync._tcp."
        ));
    }

    @Test
    public void matchesAndroidCallbackTypeWithTrailingDot() {
        assertTrue(FolioleCompanionNsdDiscovery.sameServiceType(
            "_foliole-sync._tcp",
            "_foliole-sync._tcp."
        ));
    }

    @Test
    public void rejectsDifferentServiceType() {
        assertFalse(FolioleCompanionNsdDiscovery.sameServiceType(
            "_foliole-sync._tcp",
            "_http._tcp."
        ));
    }

    @Test
    public void formatsIpv4AndIpv6DiscoveryHostsForHttpEndpoints() throws Exception {
        assertEquals("192.168.0.11", FolioleCompanionNsdAddresses.endpointHost(
            InetAddress.getByName("192.168.0.11")
        ));
        assertEquals("[fe80:0:0:0:0:0:0:11]", FolioleCompanionNsdAddresses.endpointHost(
            InetAddress.getByName("fe80::11")
        ));
        assertEquals("[fe80:0:0:0:0:0:0:11%27]", FolioleCompanionNsdAddresses.endpointHost(
            Inet6Address.getByAddress(null, InetAddress.getByName("fe80::11").getAddress(), 27)
        ));
    }
}
