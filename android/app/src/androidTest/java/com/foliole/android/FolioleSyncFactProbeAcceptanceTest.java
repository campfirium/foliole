package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class FolioleSyncFactProbeAcceptanceTest {
    private static final String APP_ID = "com.campfirium.foliole.android.acceptance";
    private static final String RESULT = "sync-fact-probe-result";

    @Test
    public void measuresEmptyReceiverThroughCapacitorBridge() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("Refusing to launch the product app", APP_ID, context.getPackageName());
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(APP_ID);
        assertNotNull(intent);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        WebView webView = activity.findViewById(R.id.webview);
        assertNotNull(webView);
        FolioleCompanionWebViewSemanticAdapter.waitForAttribute(instrumentation, webView,
            RESULT, "data-status", "ready", 45000, new JSONObject());
        JSONObject click = FolioleCompanionWebViewSemanticAdapter.perform(instrumentation,
            webView, "sync-fact-probe-run", "click", "");
        assertTrue(click.toString(), click.optBoolean("ok"));
        JSONObject result = awaitResult(instrumentation, webView);
        assertEquals(result.toString(), "passed", result.getString("status"));
        assertEquals(APP_ID, result.getString("appId"));
        assertEquals("android", result.getString("platform"));
        JSONArray cases = result.getJSONArray("results");
        assertEquals(2, cases.length());
        assertEquals(32, cases.getJSONObject(0).getInt("facts"));
        assertEquals(128, cases.getJSONObject(1).getInt("facts"));
        assertEquals(32, result.getJSONObject("pageApply").getInt("facts"));
        assertEquals(0, result.getJSONObject("pageApply").getInt("appliedObjects"));
        try (FileOutputStream output = new FileOutputStream(
            new File(context.getFilesDir(), "sync-fact-probe-result.json"))) {
            output.write(result.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private JSONObject awaitResult(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(5);
        while (System.nanoTime() < deadline) {
            String status = FolioleCompanionWebViewSemanticAdapter.readAttribute(
                instrumentation, webView, RESULT, "data-status").optString("value");
            if ("passed".equals(status) || "failed".equals(status)) {
                return new JSONObject(FolioleCompanionWebViewSemanticAdapter.readAttribute(
                    instrumentation, webView, RESULT, "data-result").getString("value"));
            }
            Thread.sleep(250);
        }
        throw new IllegalStateException("Timed out waiting for the isolated sync fact probe.");
    }
}
