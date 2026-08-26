package com.foliole.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncGroupJoinScenario {
    private FolioleCompanionSyncGroupJoinScenario() {}

    static JSONObject run(Instrumentation instrumentation) throws Exception {
        Activity activity = start(instrumentation);
        try {
            waitForFocus(activity, 30_000);
            WebView webView = activity.findViewById(R.id.webview);
            FolioleCompanionSettingsNavigation.open(instrumentation, webView);
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(3);
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-settings-sync", deadline
            );
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-group-join", deadline
            );
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-group-join", deadline
            );
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-now", deadline
            );
            instrumentation.runOnMainSync(activity::finish);
            activity = start(instrumentation);
            waitForFocus(activity, 30_000);
            webView = activity.findViewById(R.id.webview);
            FolioleCompanionSettingsNavigation.open(instrumentation, webView);
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-settings-sync", deadline
            );
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-now", deadline
            );
            return new JSONObject().put("ok", true).put("targetTestId", "sync-group-device-join")
                .put("joined", true).put("restarted", true);
        } finally {
            Activity finalActivity = activity;
            instrumentation.runOnMainSync(finalActivity::finish);
        }
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
