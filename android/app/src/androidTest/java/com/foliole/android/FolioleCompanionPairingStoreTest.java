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

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionPairingStoreTest {
    private static final String PREFS_NAME = "foliole_companion_pairing";

    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        prefs().edit().clear().commit();
    }

    @Test
    public void savedPairingCredentialsCanSignSyncRequests() throws Exception {
        FolioleCompanionPairingStore.savePairingCredentials(
            context,
            "android-test-device",
            "android-capacitor",
            "Android Test",
            "secret-1",
            "2026-04-27T06:00:00.000Z"
        );

        JSObject state = FolioleCompanionPairingStore.loadPairingState(context);
        JSObject signed = FolioleCompanionPairingStore.signRequest(
            context,
            "GET",
            "/companion/sync-state?limit=1&after_state_seq=0",
            "2026-04-27T06:00:01.000Z",
            "nonce-1",
            "empty-body-hash"
        );
        JSObject headers = signed.getJSObject("headers");

        assertTrue(state.getBoolean("is_paired"));
        assertNotNull(headers);
        assertEquals("android-test-device", headers.getString("X-Device-Id"));
        assertNotNull(headers.getString("X-Signature"));
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
}
