package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSemanticActions {
    private FolioleCompanionSemanticActions() {}

    static void clickVisible(
        Instrumentation instrumentation, WebView webView, String testId, long deadline
    ) throws Exception {
        waitForUniqueVisible(instrumentation, webView, testId, deadline);
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, testId, "click", ""
        );
        if (!receipt.optBoolean("ok")) {
            throw new IllegalStateException("Semantic action failed: " + receipt);
        }
    }

    static void waitForUniqueVisible(
        Instrumentation instrumentation, WebView webView, String testId, long deadline
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            int visible = visibleTargetCount(instrumentation, webView, testId);
            if (visible == 1) return;
            if (visible > 1) throw new IllegalStateException(
                "Semantic target is not unique: " + testId
            );
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for semantic target: " + testId);
    }

    static String waitForAnyVisible(
        Instrumentation instrumentation, WebView webView, long deadline, String... targets
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONArray elements = FolioleCompanionWebViewSemanticAdapter
                .snapshot(instrumentation, webView).getJSONArray("elements");
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (!element.optBoolean("visible")) continue;
                String testId = element.optString("testId");
                for (String target : targets) if (target.equals(testId)) return testId;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for a semantic target.");
    }

    private static int visibleTargetCount(
        Instrumentation instrumentation, WebView webView, String testId
    ) throws Exception {
        JSONArray elements = FolioleCompanionWebViewSemanticAdapter
            .snapshot(instrumentation, webView).getJSONArray("elements");
        int visible = 0;
        for (int index = 0; index < elements.length(); index += 1) {
            JSONObject element = elements.getJSONObject(index);
            if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                visible += 1;
            }
        }
        return visible;
    }
}
