package com.foliole.android;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.net.InetAddress;
import java.net.Inet6Address;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

    @Test
    public void acceptsOnlyLiteralIpv4RoutesFromDnsSdTxt() {
        assertEquals(Arrays.asList("192.168.0.11", "10.0.0.4"),
            FolioleCompanionNsdAddresses.advertisedIpv4Hosts(
                "192.168.0.11,host.local,10.0.0.4,010.0.0.5,300.1.1.1"
                    .getBytes(StandardCharsets.UTF_8)
            ));
    }

    @Test
    public void projectsThePreparedTopologyRoleFromTheSharedHostFixture() throws Exception {
        String roleTxtKey = jsonStringField(readUtf8(sharedFixturePath()), "role_txt_key");
        String bridgeRoleTxtKey = jsonStringField(readUtf8(bridgeContractPath()), "topologyRole");

        assertEquals(roleTxtKey, bridgeRoleTxtKey);
        assertTrue(FolioleCompanionNsdProtocolTxt.contractKeys().contains("topologyRole"));
    }

    private static String jsonStringField(String json, String fieldName) {
        Matcher matcher = Pattern.compile(
            "\\\"" + Pattern.quote(fieldName) + "\\\"\\s*:\\s*\\\"([^\\\"]+)\\\""
        ).matcher(json);
        if (!matcher.find()) throw new IllegalStateException("json_string_field_missing: " + fieldName);
        return matcher.group(1);
    }

    private static Path sharedFixturePath() {
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        return firstExistingPath(
            root.resolve("lib/platform/fixtures/sync-anchor-topology-v5.json"),
            root.resolve("../lib/platform/fixtures/sync-anchor-topology-v5.json").normalize(),
            root.resolve("../../lib/platform/fixtures/sync-anchor-topology-v5.json").normalize()
        );
    }

    private static Path bridgeContractPath() {
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        return firstExistingPath(
            root.resolve("android/app/src/main/assets/companion-bridge-contract-definitions.json"),
            root.resolve("app/src/main/assets/companion-bridge-contract-definitions.json"),
            root.resolve("src/main/assets/companion-bridge-contract-definitions.json")
        );
    }

    private static Path firstExistingPath(Path... candidates) {
        for (Path candidate : candidates) {
            if (Files.exists(candidate)) return candidate;
        }
        throw new IllegalStateException("fixture_path_missing: " + Arrays.toString(candidates));
    }

    private static String readUtf8(Path path) throws Exception {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }
}
