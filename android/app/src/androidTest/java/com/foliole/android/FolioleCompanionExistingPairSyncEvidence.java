package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionExistingPairSyncEvidence {
    private FolioleCompanionExistingPairSyncEvidence() {}

    static JSONObject await(
        Instrumentation instrumentation,
        WebView webView,
        long deadline,
        String syncTarget
    ) throws Exception {
        boolean syncStarted = false;
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionPairSyncEvidence.read(instrumentation, webView);
            JSONObject evidence = FolioleCompanionPairSyncEvidence.terminalEvidence(state);
            FolioleCompanionPairSyncEvidence.emit(instrumentation, state);
            boolean targetEnabled = isTargetEnabled(instrumentation, webView, syncTarget);
            if (!targetEnabled) syncStarted = true;
            if ("saved_signable".equals(evidence.optString("credentials"))
                && syncStarted && targetEnabled) {
                evidence.put("initialSync", "completed");
                return evidence;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for existing workspace sync completion.");
    }

    private static boolean isTargetEnabled(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        JSONArray elements = FolioleCompanionWebViewSemanticAdapter
            .snapshot(instrumentation, webView).getJSONArray("elements");
        for (int index = 0; index < elements.length(); index += 1) {
            JSONObject element = elements.getJSONObject(index);
            if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                return !element.optBoolean("disabled");
            }
        }
        return false;
    }
}
