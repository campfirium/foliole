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
public class FolioleRequestSnapshotAcceptanceTest {
    private static final String APP_ID = "com.campfirium.foliole.android.acceptance";
    private static final String RESULT = "request-snapshot-result";

    @Test
    public void cancelsProductionSnapshotInBackgroundAndRecovers() throws Exception {
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
            "request-snapshot-start", "click", "").optBoolean("ok"));
        FolioleCompanionWebViewSemanticAdapter.waitForAttribute(instrumentation, webView,
            RESULT, "data-phase", "await-background", 120000, new JSONObject());
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(home);
        instrumentation.waitForIdleSync();
        FolioleCompanionWebViewSemanticAdapter.waitForAttribute(instrumentation, webView,
            RESULT, "data-phase", "cancelled", 30000, new JSONObject());
        Intent resume = context.getPackageManager().getLaunchIntentForPackage(APP_ID);
        assertNotNull(resume);
        resume.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(resume);
        JSONObject result = awaitResult(instrumentation, webView);
        try (FileOutputStream output = new FileOutputStream(new File(context.getFilesDir(), "request-snapshot-result.json"))) {
            output.write(result.toString().getBytes(StandardCharsets.UTF_8));
        }
        assertEquals(result.toString(), "passed", result.getString("status"));
        assertEquals(APP_ID, result.getString("appId"));
        assertEquals("android", result.getString("platform"));
        assertTrue(result.getBoolean("cancelled"));
        assertTrue(result.getBoolean("cleanup"));
        assertEquals(48, result.getInt("originalVersions"));
        assertEquals(50, result.getInt("recoveredVersions"));
    }

    private JSONObject awaitResult(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(2);
        boolean throughput = false;
        while (System.nanoTime() < deadline) {
            if (!throughput && "throughput".equals(FolioleCompanionWebViewSemanticAdapter.readAttribute(
                    instrumentation, webView, RESULT, "data-phase").optString("value"))) {
                throughput = true;
                deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(10);
            }
            String status = FolioleCompanionWebViewSemanticAdapter.readAttribute(
                instrumentation, webView, RESULT, "data-status").optString("value");
            if ("passed".equals(status) || "failed".equals(status)) {
                return new JSONObject(FolioleCompanionWebViewSemanticAdapter.readAttribute(
                    instrumentation, webView, RESULT, "data-result").getString("value"));
            }
            Thread.sleep(250);
        }
        throw new IllegalStateException("Request snapshot acceptance timed out");
    }
}
