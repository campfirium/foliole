package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncGroupMaintenanceScenario {
    private FolioleCompanionSyncGroupMaintenanceScenario() {}

    static JSONObject leave(Instrumentation instrumentation, WebView webView) throws Exception {
        openSettings(instrumentation, webView);
        click(instrumentation, webView, "companion-settings-sync");
        click(instrumentation, webView, "companion-sync-group-leave");
        JSONObject receipt = click(instrumentation, webView, "companion-sync-group-leave-confirm");
        waitForLeaveOutcome(instrumentation, webView, 30_000);
        return receipt.put("departurePersisted", true);
    }

    static JSONObject clearAppData(Instrumentation instrumentation, WebView webView) throws Exception {
        openSettings(instrumentation, webView);
        click(instrumentation, webView, "companion-settings-storage");
        click(instrumentation, webView, "companion-storage-clear");
        JSONObject receipt = click(instrumentation, webView, "companion-storage-clear-confirm");
        waitUntilMissing(instrumentation, webView, "companion-storage-clear-confirm", 30_000);
        return receipt.put("appDataCleared", true);
    }

    private static void openSettings(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        String entry = FolioleCompanionPairSyncRecoveryScenario.waitForAnyVisible(
            instrumentation, webView, deadline,
            "companion-tab-settings", "companion-top-bar-left-action"
        );
        if ("companion-top-bar-left-action".equals(entry)) {
            FolioleCompanionPairSyncRecoveryScenario.clickVisible(
                instrumentation, webView, entry, deadline
            );
        }
        click(instrumentation, webView, "companion-tab-settings");
    }

    private static JSONObject click(Instrumentation instrumentation, WebView webView, String testId) throws Exception {
        waitUntilVisible(instrumentation, webView, testId, 30_000);
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, testId, "click", ""
        );
        if (!receipt.optBoolean("ok")) throw new IllegalStateException(receipt.toString());
        return receipt;
    }

    private static void waitUntilMissing(
        Instrumentation instrumentation, WebView webView, String testId, long timeoutMs
    ) throws Exception {
        waitForVisibility(instrumentation, webView, testId, timeoutMs, false);
    }

    private static void waitForLeaveOutcome(
        Instrumentation instrumentation, WebView webView, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            JSONObject snapshot = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            boolean confirmationVisible = false;
            for (int index = 0; index < snapshot.getJSONArray("elements").length(); index += 1) {
                JSONObject item = snapshot.getJSONArray("elements").getJSONObject(index);
                if (!item.optBoolean("visible")) continue;
                String testId = item.optString("testId");
                confirmationVisible |= "companion-sync-group-leave-confirm".equals(testId);
                if ("companion-sync-group-leave-error".equals(testId)) {
                    JSONObject error = FolioleCompanionWebViewSemanticAdapter.readAttribute(
                        instrumentation, webView, testId, "data-error-code"
                    );
                    throw new IllegalStateException("Product Leave failed: " + error.optString("value"));
                }
            }
            if (!confirmationVisible) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for product Leave completion.");
    }

    private static void waitUntilVisible(
        Instrumentation instrumentation, WebView webView, String testId, long timeoutMs
    ) throws Exception {
        waitForVisibility(instrumentation, webView, testId, timeoutMs, true);
    }

    private static void waitForVisibility(
        Instrumentation instrumentation, WebView webView, String testId, long timeoutMs, boolean expected
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject latestSnapshot = new JSONObject();
        while (System.nanoTime() < deadline) {
            JSONObject snapshot = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            latestSnapshot = snapshot;
            boolean visible = false;
            for (int index = 0; index < snapshot.getJSONArray("elements").length(); index += 1) {
                JSONObject item = snapshot.getJSONArray("elements").getJSONObject(index);
                visible |= testId.equals(item.optString("testId")) && item.optBoolean("visible");
            }
            if (visible == expected) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException(
            "Timed out waiting for product state: " + testId + "; semantic=" + latestSnapshot
        );
    }
}
