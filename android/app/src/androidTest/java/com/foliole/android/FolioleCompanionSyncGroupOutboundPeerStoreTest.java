package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

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
        context = InstrumentationRegistry.getInstrumentation().getContext();
        clear();
        seedCurrentGroupCredential("authorization-mobile-b");
    }

    @After
    public void tearDown() {
        clear();
    }

    @Test
    public void signsRoutesFromPersistedCurrentGroupWhenProviderIsStopped() throws Exception {
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-mobile-b",
            "authorization-desktop-a", "http://10.0.0.1:38641");
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-mobile-b",
            "authorization-desktop-c", "http://10.0.0.3:38641/");

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
    public void refusesAStoredRouteBoundToAnotherLocalAuthorization() throws Exception {
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-stale",
            "authorization-desktop-a", "http://10.0.0.1:38641");

        assertThrows(SecurityException.class, () -> sign("http://10.0.0.1:38641"));
    }

    @Test
    public void bindsTheCurrentRouteByPeerIdentityWithoutChangingItsCredential() throws Exception {
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, "group-1", "authorization-mobile-b",
            "authorization-desktop-a", "http://10.0.0.1:38641");
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
            context, "group-1", "authorization-mobile-b",
            "authorization-desktop-c", "http://10.0.0.3:38641");

        FolioleCompanionAppDataStore.clear(context);

        assertNull(FolioleCompanionSyncGroupPeerStore.load(context, "desktop-c"));
        assertThrows(SecurityException.class, () -> sign("http://10.0.0.3:38641"));
    }

    private JSObject sign(String endpoint) throws Exception {
        return FolioleCompanionSyncGroupOutboundPeerStore.signCurrentGroupRequest(
            context, "group-1", endpoint, "GET", "/companion/sync-pack?after_state_seq=0",
            "2026-08-09T00:00:00.000Z", "nonce", "body-hash"
        );
    }

    private void seedCurrentGroupCredential(String authorizationId) {
        try (SQLiteDatabase database = context.openOrCreateDatabase(
            "foliole-companionSQLite.db", Context.MODE_PRIVATE, null
        )) {
            database.execSQL("CREATE TABLE IF NOT EXISTS sync_groups (group_id TEXT PRIMARY KEY, " +
                "display_name TEXT NOT NULL, timeline_id TEXT NOT NULL, created_by_host_name TEXT NOT NULL, " +
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, workgroup_key TEXT)");
            database.execSQL("CREATE TABLE IF NOT EXISTS sync_group_members (group_id TEXT NOT NULL, " +
                "host_name TEXT NOT NULL, host_platform TEXT NOT NULL, state TEXT NOT NULL, " +
                "approved_by_host_name TEXT NOT NULL, authorization_id TEXT NOT NULL UNIQUE, " +
                "provisioning_cursor INTEGER, joined_at TEXT NOT NULL, activated_at TEXT, left_at TEXT, " +
                "updated_at TEXT NOT NULL, PRIMARY KEY (group_id, host_name))");
            database.execSQL("CREATE TABLE IF NOT EXISTS sync_group_local_state (singleton_id INTEGER PRIMARY KEY, " +
                "group_id TEXT, local_host_name TEXT NOT NULL, member_state TEXT NOT NULL, " +
                "provisioning_cursor INTEGER, created_empty_proof_json TEXT, updated_at TEXT NOT NULL)");
            database.execSQL("DELETE FROM sync_group_local_state WHERE singleton_id = 1");
            database.execSQL("DELETE FROM sync_group_members WHERE group_id = 'group-1'");
            database.execSQL("DELETE FROM sync_groups WHERE group_id = 'group-1'");
            database.execSQL("INSERT INTO sync_groups VALUES " +
                "('group-1', 'Group', 'timeline-1', 'A5', 'now', 'now', 'one-workgroup-key')");
            database.execSQL("INSERT INTO sync_group_members VALUES " +
                "('group-1', 'A5', 'android-capacitor', 'active', 'A5', ?, NULL, 'now', 'now', NULL, 'now')",
                new Object[]{authorizationId});
            database.execSQL("INSERT INTO sync_group_local_state VALUES " +
                "(1, 'group-1', 'A5', 'active', NULL, NULL, 'now')");
        }
    }

    private void clear() {
        context.getSharedPreferences("foliole_sync_group_outbound_peers", Context.MODE_PRIVATE).edit().clear().commit();
        if (!context.getDatabasePath("foliole-companionSQLite.db").exists()) return;
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
            context.getDatabasePath("foliole-companionSQLite.db").getPath(), null,
            SQLiteDatabase.OPEN_READWRITE
        )) {
            database.execSQL("DELETE FROM sync_group_local_state WHERE singleton_id = 1");
            database.execSQL("DELETE FROM sync_group_members WHERE group_id = 'group-1'");
            database.execSQL("DELETE FROM sync_groups WHERE group_id = 'group-1'");
        }
    }
}
