package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionPairingStoreTest {
    private static final String PREFS_NAME = "foliole_companion_pairing";

    private Context context;
    private Map<String, ?> originalPrefs;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        originalPrefs = new HashMap<>(prefs().getAll());
        prefs().edit().clear().commit();
    }

    @After
    public void tearDown() {
        SharedPreferences.Editor editor = prefs().edit().clear();
        for (Map.Entry<String, ?> entry : originalPrefs.entrySet()) {
            restorePreference(editor, entry.getKey(), entry.getValue());
        }
        editor.commit();
    }

    @Test
    public void savedPairingCredentialsCanSignSyncRequests() throws Exception {
        prefs().edit().putString("primary_device_id", "legacy-desktop").commit();
        FolioleCompanionPairingStore.savePairingCredentials(
            context,
            "authorization-android-test",
            "secret-1",
            "Android Test",
            "android-capacitor",
            1,
            "2026-04-27T06:00:00.000Z",
            "desktop-device-1",
            "Foliole Desktop on Windows",
            "Windows",
            protocol()
        );

        JSObject state = FolioleCompanionPairingStore.loadPairingState(context);
        JSObject signed = FolioleCompanionPairingStore.signRequest(
            context,
            "GET",
            "/companion/sync-pack?after_state_seq=0",
            "2026-04-27T06:00:01.000Z",
            "nonce-1",
            "empty-body-hash"
        );
        JSObject headers = signed.getJSObject("headers");

        assertTrue(state.getBoolean("is_paired"));
        assertTrue(state.getBoolean("sync_usable"));
        assertEquals("desktop-device-1", state.getString("remote_peer_id"));
        assertEquals("Foliole Desktop on Windows", state.getString("remote_peer_name"));
        assertEquals("Windows", state.getString("remote_peer_platform"));
        assertFalse(prefs().contains("primary_device_id"));
        assertNotNull(headers);
        assertEquals("authorization-android-test", headers.getString("X-Authorization-Id"));
        assertNotNull(headers.getString("X-Signature"));
    }

    @Test
    public void oldPairingMetadataRequiresRepairBeforeSigning() throws Exception {
        FolioleCompanionPairingStore.savePairingCredentials(
            context,
            "authorization-android-test",
            "secret-1",
            "Android Test",
            "android-capacitor",
            1,
            "2026-04-27T06:00:00.000Z",
            null,
            null,
            null,
            protocol()
        );
        prefs().edit().remove("negotiated_protocol_version").remove("remote_protocol").commit();

        JSObject state = FolioleCompanionPairingStore.loadPairingState(context);

        assertTrue(state.getBoolean("is_paired"));
        assertTrue(state.getBoolean("repair_required"));
        assertFalse(state.getBoolean("sync_usable"));
        try {
            FolioleCompanionPairingStore.signRequest(
                context,
                "GET",
                "/companion/sync-pack?after_state_seq=0",
                "2026-04-27T06:00:01.000Z",
                "nonce-repair",
                "empty-body-hash"
            );
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("repaired"));
            return;
        }
        throw new AssertionError("Expected old pairing metadata to block signing.");
    }

    @Test
    public void unreadablePairingSecretIsNotReportedAsPaired() throws Exception {
        prefs().edit()
            .putString("device_id", "android-test-device")
            .putString("device_kind", "android-capacitor")
            .putString("device_name", "Android Test")
            .putString("device_secret", "not-valid-base64")
            .putString("device_secret_iv", "not-valid-base64")
            .putString("paired_at", "2026-04-27T06:00:00.000Z")
            .commit();

        JSObject state = FolioleCompanionPairingStore.loadPairingState(context);

        assertFalse(state.getBoolean("is_paired"));
        assertFalse(prefs().contains("device_secret"));
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private JSObject protocol() throws Exception {
        JSObject protocol = new JSObject();
        protocol.put("version", 1);
        protocol.put("min_supported_version", 1);
        protocol.put("max_supported_version", 1);
        protocol.put("capabilities", new org.json.JSONArray().put("lan-sync-v1"));
        return protocol;
    }

    @SuppressWarnings("unchecked")
    private void restorePreference(SharedPreferences.Editor editor, String key, Object value) {
        if (value instanceof String stringValue) {
            editor.putString(key, stringValue);
        } else if (value instanceof Boolean booleanValue) {
            editor.putBoolean(key, booleanValue);
        } else if (value instanceof Integer integerValue) {
            editor.putInt(key, integerValue);
        } else if (value instanceof Long longValue) {
            editor.putLong(key, longValue);
        } else if (value instanceof Float floatValue) {
            editor.putFloat(key, floatValue);
        } else if (value instanceof Set<?> setValue) {
            editor.putStringSet(key, new HashSet<>((Set<String>) setValue));
        }
    }
}
