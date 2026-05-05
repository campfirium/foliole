package com.foliole.android;

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

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionWebViewBridgeSmokeTest {
    @Test
    public void exposesCapacitorSyncPluginsInMainWebView() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = startMainActivity(instrumentation);
        try {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            JSONObject bridge = waitForBridge(instrumentation, webView);
            assertTrue(bridge.optBoolean("hasPlugins"));
            assertTrue(bridge.optBoolean("hasBootstrap"));
            assertTrue(bridge.optBoolean("hasSyncPackTransfer"));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static Activity startMainActivity(Instrumentation instrumentation) {
        Context context = instrumentation.getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) {
            throw new IllegalStateException("Main launch intent is missing.");
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private static JSONObject waitForBridge(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = evaluateBridgeState(instrumentation, webView);
            if (latest.optBoolean("hasBootstrap") && latest.optBoolean("hasSyncPackTransfer")) {
                return latest;
            }
            Thread.sleep(100);
        }
        return latest;
    }

    private static JSONObject evaluateBridgeState(Instrumentation instrumentation, WebView webView) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> rawResult = new AtomicReference<>("");
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(
            "(function(){var plugins=(window.Capacitor&&window.Capacitor.Plugins)||{};" +
                "return JSON.stringify({hasPlugins:!!window.Capacitor&&!!window.Capacitor.Plugins," +
                "hasBootstrap:!!plugins.FolioleCompanionBootstrap," +
                "hasSyncPackTransfer:!!plugins.FolioleCompanionSyncPackTransfer});})()",
            value -> {
                rawResult.set(value);
                latch.countDown();
            }
        ));
        if (!latch.await(2, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Timed out while evaluating WebView bridge.");
        }
        return new JSONObject(new JSONArray("[" + rawResult.get() + "]").getString(0));
    }
}
