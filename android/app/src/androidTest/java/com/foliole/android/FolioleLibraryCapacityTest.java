package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class FolioleLibraryCapacityTest {
    private static final String APP_ID = "com.foliole.android.acceptance";
    private static final String RESULT = "t219-capacity-result";

    @Test
    public void measuresIsolatedWorkspaceSnapshot() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("Refusing to launch a product package", APP_ID, context.getPackageName());
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(APP_ID);
        assertNotNull(intent);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        WebView webView = activity.findViewById(R.id.webview);
        assertNotNull(webView);
        FolioleCompanionWebViewSemanticAdapter.waitForAttribute(instrumentation, webView,
            RESULT, "data-status", "ready", 45000, new JSONObject());
        JSONObject click = FolioleCompanionWebViewSemanticAdapter.perform(instrumentation,
            webView, "t219-run-capacity", "click", "");
        assertTrue(click.toString(), click.optBoolean("ok"));
        JSONObject result = awaitResult(instrumentation, webView);
        Bundle evidence = new Bundle();
        evidence.putString("stream", "FOLIOLE_LIBRARY_CAPACITY_RESULT=" + result + "\n");
        instrumentation.sendStatus(2, evidence);
        assertEquals(result.toString(), "passed", result.getString("status"));
        assertEquals(APP_ID, result.getString("appId"));
        assertEquals("android", result.getString("platform"));
        assertEquals(2, result.getJSONArray("results").length());
        // Leave the acceptance Activity foregrounded; the fixed host owner restores it after instrumentation exits.
    }

    private JSONObject awaitResult(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(15);
        while (System.nanoTime() < deadline) {
            String status = FolioleCompanionWebViewSemanticAdapter.readAttribute(
                instrumentation, webView, RESULT, "data-status").optString("value");
            if ("passed".equals(status) || "failed".equals(status)) {
                return new JSONObject(FolioleCompanionWebViewSemanticAdapter.readAttribute(
                    instrumentation, webView, RESULT, "data-result").getString("value"));
            }
            Thread.sleep(500);
        }
        throw new IllegalStateException("Timed out waiting for the fixed library capacity result.");
    }
}
