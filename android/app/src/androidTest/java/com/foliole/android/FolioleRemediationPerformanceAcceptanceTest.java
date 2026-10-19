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
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleRemediationPerformanceAcceptanceTest {
    private static final String APP_ID = "com.campfirium.foliole.android.acceptance";
    private static final String RESULT = "remediation-performance-result";

    @Test
    public void measuresAttachmentReadingAndDetailProductionPaths() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("Refusing a product package", APP_ID, context.getPackageName());
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(APP_ID);
        assertNotNull(launch);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity activity = instrumentation.startActivitySync(launch);
        WebView webView = activity.findViewById(R.id.webview);
        assertNotNull(webView);
        FolioleCompanionWebViewSemanticAdapter.waitForAttribute(instrumentation, webView,
            RESULT, "data-status", "ready", 45000, new JSONObject());
        assertTrue(FolioleCompanionWebViewSemanticAdapter.perform(instrumentation, webView,
            "remediation-performance-start", "click", "").optBoolean("ok"));
        JSONObject result = awaitResult(instrumentation, webView);
        try (FileOutputStream output = new FileOutputStream(new File(context.getFilesDir(), "remediation-performance-result.json"))) {
            output.write(result.toString().getBytes(StandardCharsets.UTF_8));
        }
        assertEquals(result.toString(), "passed", result.getString("status"));
        assertEquals(APP_ID, result.getString("appId"));
        assertEquals("android", result.getString("platform"));
        assertTrue(result.getBoolean("cleanup"));
        assertEquals(1000, result.getInt("fixtureNodes"));
        assertEquals(500, result.getJSONObject("details").getInt("expandedNodes"));
    }

    private JSONObject awaitResult(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(10);
        while (System.nanoTime() < deadline) {
            String status = FolioleCompanionWebViewSemanticAdapter.readAttribute(
                instrumentation, webView, RESULT, "data-status").optString("value");
            if ("passed".equals(status) || "failed".equals(status)) {
                return new JSONObject(FolioleCompanionWebViewSemanticAdapter.readAttribute(
                    instrumentation, webView, RESULT, "data-result").getString("value"));
            }
            Thread.sleep(250);
        }
        throw new IllegalStateException("Remediation performance acceptance timed out");
    }
}
