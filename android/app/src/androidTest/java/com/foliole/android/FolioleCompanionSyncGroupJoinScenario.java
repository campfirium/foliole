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
    private static final long STAGE_TIMEOUT_SECONDS = 30;

    private FolioleCompanionSyncGroupJoinScenario() {}

    static JSONObject run(Instrumentation instrumentation) throws Exception {
        Activity activity = start(instrumentation);
        try {
            waitForFocus(activity, 30_000);
            Log.i(LOG_TAG, "stage=focused");
            WebView webView = activity.findViewById(R.id.webview);
            JSONObject prejoinFact = FolioleCompanionSyncGroupMaintenanceScenario.createFact(
                instrumentation, webView
            );
            Log.i(LOG_TAG, "stage=prejoin-fact-created");
            FolioleCompanionSettingsNavigation.open(instrumentation, webView);
            Log.i(LOG_TAG, "stage=settings-open");
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-settings-sync", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=sync-open");
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-discover", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=discovery-requested");
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-group-join", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=device-visible");
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-group-join", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=device-requested");
            String requestState = FolioleCompanionSemanticActions.waitForAnyVisible(
                instrumentation, webView, stageDeadline(),
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
                instrumentation, webView, "companion-sync-now", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=joined");
            instrumentation.runOnMainSync(activity::finish);
            activity = start(instrumentation);
            waitForFocus(activity, 30_000);
            webView = activity.findViewById(R.id.webview);
            FolioleCompanionSettingsNavigation.open(instrumentation, webView);
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-settings-sync", stageDeadline()
            );
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-now", stageDeadline()
            );
            return new JSONObject().put("ok", true).put("targetTestId", "sync-group-device-join")
                .put("joined", true).put("restarted", true)
                .put("prejoinFactId", prejoinFact.getString("factId"));
        } finally {
            Activity finalActivity = activity;
            instrumentation.runOnMainSync(finalActivity::finish);
        }
    }

    private static long stageDeadline() {
        return System.nanoTime() + TimeUnit.SECONDS.toNanos(STAGE_TIMEOUT_SECONDS);
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
