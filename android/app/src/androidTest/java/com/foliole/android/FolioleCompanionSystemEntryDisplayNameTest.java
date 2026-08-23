package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSystemEntryDisplayNameTest {
    private static final String INBOX_TEST_ID = "companion-directory-node-special-inbox";

    @Test
    public void displaysHydratedInboxNameAfterRestart() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle arguments = InstrumentationRegistry.getArguments();
        String expected = decode(arguments.getString("expectedTextBase64", ""));
        String forbidden = decode(arguments.getString("forbiddenTextBase64", ""));
        Activity activity = FolioleCompanionActivityLauncher.start(instrumentation, 30_000);
        try {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            JSONObject sync = requestProductSync(instrumentation, webView);
            FolioleCompanionCaptureNavigation.openDirectorySurface(
                instrumentation, webView, 30_000
            );
            JSONObject displayed = awaitDisplayedInbox(
                instrumentation, webView, expected, forbidden, 120_000
            );
            assertTrue(displayed.toString(), displayed.optBoolean("visible"));
            assertFalse(displayed.toString(), displayed.optString("text").isEmpty());
            if (!expected.isEmpty()) assertEquals(displayed.toString(), expected, displayed.optString("text"));
            if (!forbidden.isEmpty()) assertFalse(displayed.toString(), forbidden.equals(displayed.optString("text")));
            sendEvidence(instrumentation, displayed, expected, forbidden, sync);
        } finally {
            activity.runOnUiThread(activity::finish);
        }
    }

    private static String decode(String value) {
        return new String(Base64.decode(value, Base64.DEFAULT), StandardCharsets.UTF_8);
    }

    private static JSONObject readDisplayedInbox(
        Instrumentation instrumentation,
        WebView webView
    ) throws Exception {
        return FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView,
            "(function(){var node=document.querySelector('[data-testid=\"" + INBOX_TEST_ID +
                "\"]');var rect=node?node.getBoundingClientRect():null;return JSON.stringify({" +
                "language:document.documentElement.lang||'',text:node?(node.textContent||'').trim():''," +
                "visible:!!(node&&rect&&rect.width&&rect.height)});})()"
        );
    }

    private static JSONObject requestProductSync(
        Instrumentation instrumentation,
        WebView webView
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        FolioleCompanionSettingsNavigation.open(instrumentation, webView);
        FolioleCompanionPairSyncRecoveryScenario.clickVisible(
            instrumentation, webView, "companion-settings-sync", deadline
        );
        FolioleCompanionPairSyncRecoveryScenario.waitForUniqueVisible(
            instrumentation, webView, "companion-sync-now", deadline
        );
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, "companion-sync-now", "click", ""
        );
        if (!receipt.optBoolean("ok")) {
            throw new IllegalStateException("System entry product sync action failed: " + receipt);
        }
        return receipt;
    }

    private static JSONObject awaitDisplayedInbox(
        Instrumentation instrumentation,
        WebView webView,
        String expected,
        String forbidden,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject displayed = null;
        while (System.nanoTime() < deadline) {
            displayed = readDisplayedInbox(instrumentation, webView);
            String text = displayed.optString("text");
            boolean matches = !text.isEmpty()
                && (expected.isEmpty() || expected.equals(text))
                && (forbidden.isEmpty() || !forbidden.equals(text));
            if (displayed.optBoolean("visible") && matches) return displayed;
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for system entry display: " + displayed);
    }

    private static void sendEvidence(
        Instrumentation instrumentation,
        JSONObject displayed,
        String expected,
        String forbidden,
        JSONObject sync
    ) throws Exception {
        JSONObject receipt = new JSONObject();
        receipt.put("displayed", displayed);
        receipt.put("expectedText", expected);
        receipt.put("forbiddenText", forbidden);
        receipt.put("hydratedAfterRestart", true);
        receipt.put("sync", sync);
        Bundle evidence = new Bundle();
        evidence.putString("folioleActionReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }
}
