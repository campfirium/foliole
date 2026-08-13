package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSettingsNavigation {
    private static final long CLICK_TIMEOUT_SECONDS = 30;
    private static final String REVIEW_ACTION = "companion-review-action-later";
    private static final String SETTINGS_TAB = "companion-tab-settings";
    private static final String TOP_BAR_BACK = "companion-top-bar-back";
    private static final String TOP_BAR_LEFT_ACTION = "companion-top-bar-left-action";

    private FolioleCompanionSettingsNavigation() {}

    static void open(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (System.nanoTime() < deadline) {
            JSONObject snapshot = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            if (isVisible(snapshot, SETTINGS_TAB)) {
                click(instrumentation, webView, SETTINGS_TAB);
                return;
            }
            String exit = isVisible(snapshot, REVIEW_ACTION) && isVisible(snapshot, TOP_BAR_LEFT_ACTION)
                ? TOP_BAR_LEFT_ACTION
                : isVisible(snapshot, TOP_BAR_BACK) ? TOP_BAR_BACK : null;
            if (exit != null) click(instrumentation, webView, exit);
            Thread.sleep(500);
        }
        throw new IllegalStateException("Timed out navigating to companion Settings.");
    }

    private static boolean isVisible(JSONObject snapshot, String testId) throws Exception {
        for (int index = 0; index < snapshot.getJSONArray("elements").length(); index += 1) {
            JSONObject item = snapshot.getJSONArray("elements").getJSONObject(index);
            if (testId.equals(item.optString("testId")) && item.optBoolean("visible")) return true;
        }
        return false;
    }

    private static void click(
        Instrumentation instrumentation, WebView webView, String testId
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(CLICK_TIMEOUT_SECONDS);
        FolioleCompanionPairSyncRecoveryScenario.clickVisible(
            instrumentation, webView, testId, deadline
        );
    }
}
