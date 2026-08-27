package com.foliole.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncGroupJoinScenario {
    private static final String LOG_TAG = "FolioleA5Join";

    private FolioleCompanionSyncGroupJoinScenario() {}

    static JSONObject run(Instrumentation instrumentation) throws Exception {
        Activity activity = start(instrumentation);
        try {
            waitForFocus(activity, 30_000);
            Log.i(LOG_TAG, "stage=focused");
            WebView webView = activity.findViewById(R.id.webview);
            FolioleCompanionSettingsNavigation.open(instrumentation, webView);
            Log.i(LOG_TAG, "stage=settings-open");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-settings-sync", deadline
            );
            Log.i(LOG_TAG, "stage=sync-open");
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-group-join", deadline
            );
            Log.i(LOG_TAG, "stage=device-visible");
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-group-join", deadline
            );
            Log.i(LOG_TAG, "stage=device-requested");
            long requestDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            String requestState = FolioleCompanionSemanticActions.waitForAnyVisible(
                instrumentation, webView, requestDeadline,
                "companion-sync-awaiting-approval", "companion-sync-error"
            );
            if ("companion-sync-error".equals(requestState)) {
                JSONObject error = FolioleCompanionWebViewSemanticAdapter.readAttribute(
                    instrumentation, webView, requestState, "data-error-code"
                );
                throw new IllegalStateException(
                    "Sync Group Device request failed: " + error.optString("value", "unknown")
                );
            }
            Log.i(LOG_TAG, "stage=awaiting-approval");
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-now", deadline
            );
            Log.i(LOG_TAG, "stage=joined");
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
