package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionPairSyncRecoveryScenario {
    private static final String CONNECTED_TARGET = "companion-sync-now";

    private FolioleCompanionPairSyncRecoveryScenario() {}

    static JSONObject run(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        clickVisible(instrumentation, webView, "companion-tab-settings", timeoutMs);
        clickVisible(instrumentation, webView, "companion-settings-sync", timeoutMs);
        clickVisible(instrumentation, webView, "companion-sync-discover", timeoutMs);
        waitForUniqueVisible(instrumentation, webView, "companion-sync-pair", timeoutMs);
        clickVisible(instrumentation, webView, "companion-sync-pair", timeoutMs);
        waitForCompletedSync(instrumentation, webView, timeoutMs);
        JSONObject receipt = new JSONObject();
        receipt.put("ok", true);
        receipt.put("targetTestId", "companion-pair-sync-recovery");
        receipt.put("paired", true);
        receipt.put("initialSyncRequested", true);
        return receipt;
    }

    private static void clickVisible(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long timeoutMs
    ) throws Exception {
        waitForUniqueVisible(instrumentation, webView, testId, timeoutMs);
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, testId, "click", ""
        );
        if (!receipt.optBoolean("ok")) {
            throw new IllegalStateException("Semantic action failed: " + receipt);
        }
    }

    private static void waitForUniqueVisible(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            JSONArray elements = FolioleCompanionWebViewSemanticAdapter
                .snapshot(instrumentation, webView).getJSONArray("elements");
            int visible = 0;
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                    visible += 1;
                }
            }
            if (visible == 1) return;
            if (visible > 1) throw new IllegalStateException("Pairing target is not unique: " + testId);
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for semantic target: " + testId);
    }

    private static void waitForCompletedSync(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        waitForUniqueVisible(instrumentation, webView, CONNECTED_TARGET, timeoutMs);
        JSONObject target = uniqueVisibleTarget(instrumentation, webView, CONNECTED_TARGET);
        if (!target.optBoolean("disabled")) {
            clickVisible(instrumentation, webView, CONNECTED_TARGET, timeoutMs);
        }
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        boolean observedSyncing = false;
        while (System.nanoTime() < deadline) {
            target = uniqueVisibleTarget(instrumentation, webView, CONNECTED_TARGET);
            observedSyncing = observedSyncing || target.optBoolean("disabled");
            if (observedSyncing && !target.optBoolean("disabled")) return;
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for initial workspace sync completion.");
    }

    private static JSONObject uniqueVisibleTarget(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        JSONArray elements = FolioleCompanionWebViewSemanticAdapter
            .snapshot(instrumentation, webView).getJSONArray("elements");
        JSONObject match = null;
        for (int index = 0; index < elements.length(); index += 1) {
            JSONObject element = elements.getJSONObject(index);
            if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                if (match != null) throw new IllegalStateException("Pairing target is not unique: " + testId);
                match = element;
            }
        }
        if (match == null) throw new IllegalStateException("Pairing target disappeared: " + testId);
        return match;
    }
}
