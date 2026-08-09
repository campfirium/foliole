package com.foliole.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncGroupApprovalScenario {
    private FolioleCompanionSyncGroupApprovalScenario() {}

    static JSONObject run(Instrumentation instrumentation) throws Exception {
        Activity activity = start(instrumentation);
        boolean leaveProviderRunning = false;
        try {
            waitForFocus(activity, 30_000);
            WebView webView = activity.findViewById(R.id.webview);
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(12);
            openSyncSettings(instrumentation, webView, deadline);
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
            leaveProviderRunning = true;
            return new JSONObject().put("ok", true).put("targetTestId", "sync-group-approval")
                .put("approved", true).put("paused", true).put("resumed", true);
        } finally {
            if (!leaveProviderRunning) {
                Activity finalActivity = activity;
                instrumentation.runOnMainSync(finalActivity::finish);
            }
        }
    }

    private static void openSyncSettings(
        Instrumentation instrumentation, WebView webView, long deadline
    ) throws Exception {
        String entry = FolioleCompanionPairSyncRecoveryScenario.waitForAnyVisible(
            instrumentation, webView, deadline, "companion-tab-settings", "companion-top-bar-left-action"
        );
        if ("companion-top-bar-left-action".equals(entry)) {
            FolioleCompanionPairSyncRecoveryScenario.clickVisible(
                instrumentation, webView, entry, deadline
            );
        }
        FolioleCompanionPairSyncRecoveryScenario.clickVisible(
            instrumentation, webView, "companion-tab-settings", deadline
        );
        FolioleCompanionPairSyncRecoveryScenario.clickVisible(
            instrumentation, webView, "companion-settings-sync", deadline
        );
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
