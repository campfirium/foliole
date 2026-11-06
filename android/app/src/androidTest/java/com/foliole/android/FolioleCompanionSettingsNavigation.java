package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;
import android.view.KeyEvent;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSettingsNavigation {
    private static final String SETTINGS_TAB = "companion-tab-settings";
    private static final String READING_EXIT = "companion-reading-exit";
    private static final String ARTICLE_DOCUMENT = "companion-article-document";
    private static final String TOP_BAR_BACK = "companion-top-bar-back";
    private static final String TOP_BAR_LEFT_ACTION = "companion-top-bar-left-action";

    private FolioleCompanionSettingsNavigation() {}

    static void open(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        JSONObject latestSnapshot = null;
        while (System.nanoTime() < deadline) {
            JSONObject snapshot = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            latestSnapshot = snapshot;
            if (isVisible(snapshot, SETTINGS_TAB)) {
                if (clickObserved(instrumentation, webView, SETTINGS_TAB)) return;
            }
            String exit = isVisible(snapshot, READING_EXIT) ? READING_EXIT
                : isVisible(snapshot, TOP_BAR_LEFT_ACTION) ? TOP_BAR_LEFT_ACTION
                : isVisible(snapshot, TOP_BAR_BACK) ? TOP_BAR_BACK : null;
            if (exit != null) clickObserved(instrumentation, webView, exit);
            else if (isVisible(snapshot, ARTICLE_DOCUMENT)) {
                clickObserved(instrumentation, webView, ARTICLE_DOCUMENT);
            } else if (isVisible(snapshot, "companion-review-action-read")
                || isVisible(snapshot, "companion-review-action-reveal")) {
                instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            }
            Thread.sleep(500);
        }
        throw new IllegalStateException(
            "Timed out navigating to companion Settings; semantic=" + latestSnapshot
        );
    }

    private static boolean isVisible(JSONObject snapshot, String testId) throws Exception {
        int visibleCount = 0;
        for (int index = 0; index < snapshot.getJSONArray("elements").length(); index += 1) {
            JSONObject item = snapshot.getJSONArray("elements").getJSONObject(index);
            if (testId.equals(item.optString("testId")) && item.optBoolean("visible")) visibleCount += 1;
        }
        if (visibleCount > 1) throw new IllegalStateException("Semantic target is not unique: " + testId);
        return visibleCount == 1;
    }

    private static boolean clickObserved(
        Instrumentation instrumentation, WebView webView, String testId
    ) throws Exception {
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, testId, "click", ""
        );
        if (receipt.optBoolean("ok")) return true;
        String code = receipt.optString("code");
        if ("target_missing".equals(code) || "target_hidden".equals(code)) return false;
        throw new IllegalStateException("Semantic action failed: " + receipt);
    }
}
