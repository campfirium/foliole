package com.foliole.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;

import org.json.JSONObject;
import org.json.JSONArray;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncGroupApprovalScenario {
    private FolioleCompanionSyncGroupApprovalScenario() {}

    static JSONObject approveForeground(Instrumentation instrumentation) throws Exception {
        Activity activity = start(instrumentation);
        waitForFocus(activity, 30_000);
        WebView webView = activity.findViewById(R.id.webview);
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(12);
        openSyncSettings(instrumentation, webView, deadline);
        waitForProviderAdvertisement();
        FolioleCompanionPairSyncRecoveryScenario.waitForUniqueVisible(
            instrumentation, webView, "companion-sync-group-approve", deadline
        );
        FolioleCompanionPairSyncRecoveryScenario.clickVisible(
            instrumentation, webView, "companion-sync-group-approve", deadline
        );
        return new JSONObject().put("ok", true).put("targetTestId", "sync-group-approval")
            .put("approved", true).put("foreground", true);
    }

    static JSONObject run(Instrumentation instrumentation) throws Exception {
        Activity activity = start(instrumentation);
        try {
            waitForFocus(activity, 30_000);
            WebView webView = activity.findViewById(R.id.webview);
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(12);
            openSyncSettings(instrumentation, webView, deadline);
            waitForProviderAdvertisement();
            FolioleCompanionPairSyncRecoveryScenario.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-group-approve", deadline
            );
            FolioleCompanionPairSyncRecoveryScenario.clickVisible(
                instrumentation, webView, "companion-sync-group-approve", deadline
            );
            Thread.sleep(1_000);
            Activity pausedActivity = activity;
            instrumentation.runOnMainSync(() -> pausedActivity.moveTaskToBack(true));
            Thread.sleep(5_000);
            instrumentation.runOnMainSync(activity::finish);
            activity = start(instrumentation);
            waitForFocus(activity, 30_000);
            return new JSONObject().put("ok", true).put("targetTestId", "sync-group-approval")
                .put("approved", true).put("paused", true).put("resumed", true);
        } finally {
            Activity finalActivity = activity;
            instrumentation.runOnMainSync(finalActivity::finish);
        }
    }

    private static void openSyncSettings(
        Instrumentation instrumentation, WebView webView, long deadline
    ) throws Exception {
        waitForSettingsEntry(instrumentation, webView, deadline);
        FolioleCompanionPairSyncRecoveryScenario.clickVisible(
            instrumentation, webView, "companion-tab-settings", deadline
        );
        FolioleCompanionPairSyncRecoveryScenario.clickVisible(
            instrumentation, webView, "companion-settings-sync", deadline
        );
    }

    private static void waitForSettingsEntry(
        Instrumentation instrumentation, WebView webView, long overallDeadline
    ) throws Exception {
        long deadline = Math.min(
            overallDeadline, System.nanoTime() + TimeUnit.SECONDS.toNanos(30)
        );
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            JSONArray elements = latest.getJSONArray("elements");
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (!element.optBoolean("visible")) continue;
                if ("companion-tab-settings".equals(element.optString("testId"))) return;
                if ("companion-top-bar-left-action".equals(element.optString("testId"))
                    && isReviewExit(element.optString("ariaLabel"))) {
                    FolioleCompanionWebViewSemanticAdapter.perform(
                        instrumentation, webView, "companion-top-bar-left-action", "click", ""
                    );
                }
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Settings entry unavailable: " + latest);
    }

    private static boolean isReviewExit(String label) {
        return "Exit".equals(label) || "退出".equals(label);
    }

    private static void waitForProviderAdvertisement() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = FolioleCompanionSyncGroupProvider.state();
            String state = latest.optString("advertisement_state");
            if ("registered".equals(state)) return;
            if ("failed".equals(state)) {
                throw new IllegalStateException("Provider advertisement failed: " + latest);
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("Provider advertisement unavailable: " + latest);
    }

    private static Activity start(Instrumentation instrumentation) {
        Context context = instrumentation.getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) throw new IllegalStateException("Main launch intent is missing.");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private static void waitForFocus(Activity activity, long timeoutMs) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            if (activity.hasWindowFocus()) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Foliole did not receive window focus.");
    }
}
