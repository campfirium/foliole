package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncGroupOutboundPeerStoreTest {
    private Context context;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        clear();
    }

    @After
    public void tearDown() {
        clear();
    }

    @Test
    public void signsRoutesWithTheOneWorkgroupKey() throws Exception {
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-mobile-b", "mobile-b",
            "authorization-desktop-a", "desktop-a", "http://10.0.0.1:38641");
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-mobile-b", "mobile-b",
            "authorization-desktop-c", "desktop-c", "http://10.0.0.3:38641/");

        assertTrue(FolioleCompanionSyncGroupOutboundPeerStore.contains(context, "group-1", "authorization-desktop-a"));
        assertTrue(FolioleCompanionSyncGroupOutboundPeerStore.contains(context, "group-1", "authorization-desktop-c"));
        assertFalse(FolioleCompanionSyncGroupOutboundPeerStore.contains(context, "group-2", "authorization-desktop-c"));
        JSObject signedA = sign("http://10.0.0.1:38641");
        JSObject signedC = sign("http://10.0.0.3:38641");
        assertEquals("authorization-mobile-b", signedA.getJSObject("headers").getString("X-Authorization-Id"));
        assertEquals(
            signedA.getJSObject("headers").getString("X-Signature"),
            signedC.getJSObject("headers").getString("X-Signature")
        );
    }

    @Test
    public void refusesAnUnknownEndpointInsteadOfFallingBackToAnotherPeer() {
        assertThrows(SecurityException.class, () -> sign("http://10.0.0.9:38641"));
    }

    @Test
    public void bindsTheCurrentRouteByPeerIdentityWithoutChangingItsCredential() throws Exception {
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-mobile-b", "mobile-b",
            "authorization-desktop-a", "desktop-a", "http://10.0.0.1:38641");
        String firstSignature = sign("http://10.0.0.1:38641").getJSObject("headers").getString("X-Signature");

        FolioleCompanionSyncGroupOutboundPeerStore.bindRoute(
            context, "group-1", "authorization-desktop-a", "http://192.168.1.20:38641/");

        String reboundSignature = sign("http://192.168.1.20:38641")
            .getJSObject("headers").getString("X-Signature");
        assertEquals(firstSignature, reboundSignature);
        assertThrows(SecurityException.class, () -> sign("http://10.0.0.1:38641"));
    }

    @Test
    public void appDataClearRemovesInboundAndOutboundGroupCredentials() throws Exception {
        FolioleCompanionSyncGroupPeerStore.createSecret(context, "desktop-c");
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-mobile-b", "mobile-b",
            "authorization-desktop-c", "desktop-c", "http://10.0.0.3:38641");

        FolioleCompanionAppDataStore.clear(context);

        assertNull(FolioleCompanionSyncGroupPeerStore.load(context, "desktop-c"));
        assertThrows(SecurityException.class, () -> sign("http://10.0.0.3:38641"));
    }

    private JSObject sign(String endpoint) throws Exception {
        return FolioleCompanionSyncGroupOutboundPeerStore.signWithWorkgroupKey(
            context, "group-1", endpoint, "GET", "/companion/sync-pack?after_state_seq=0",
            "2026-08-09T00:00:00.000Z", "nonce", "body-hash", "one-workgroup-key"
        );
    }

    private void clear() {
        context.getSharedPreferences("foliole_sync_group_outbound_peers", Context.MODE_PRIVATE).edit().clear().commit();
    }
}
