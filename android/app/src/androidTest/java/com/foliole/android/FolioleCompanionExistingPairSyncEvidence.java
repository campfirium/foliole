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
            if ("failed".equals(evidence.optString("initialSync"))) {
                throw new IllegalStateException("Existing workspace sync failed.");
            }
            if (isTargetVisible(instrumentation, webView, "companion-sync-inline-attention")) {
                throw new IllegalStateException("Initial workspace sync settled with attention.");
            }
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

    static JSONObject awaitAfterStructureApplied(
        Instrumentation instrumentation,
        WebView webView,
        long deadline,
        JSONObject evidence
    ) throws Exception {
        int settledOffSurfaceSamples = 0;
        String lastTargetState = "missing";
        while (System.nanoTime() < deadline) {
            lastTargetState = targetState(instrumentation, webView, "companion-sync-now");
            if ("enabled".equals(lastTargetState)) {
                evidence.put("initialSync", "completed");
                return evidence;
            }
            if (isTargetVisible(instrumentation, webView, "companion-sync-inline-attention")) {
                throw new IllegalStateException("Initial workspace sync settled with attention.");
            }
            boolean progressVisible = isTargetVisible(
                instrumentation, webView, "companion-sync-inline-progress"
            );
            settledOffSurfaceSamples = "missing".equals(lastTargetState) && !progressVisible
                ? settledOffSurfaceSamples + 1 : 0;
            if (settledOffSurfaceSamples >= 3) {
                evidence.put("initialSync", "completed");
                return evidence;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException(
            "Timed out waiting for initial workspace sync settlement: target_" + lastTargetState + "."
        );
    }

    private static boolean isTargetEnabled(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        return "enabled".equals(targetState(instrumentation, webView, testId));
    }

    private static String targetState(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        JSONArray elements = FolioleCompanionWebViewSemanticAdapter
            .snapshot(instrumentation, webView).getJSONArray("elements");
        for (int index = 0; index < elements.length(); index += 1) {
            JSONObject element = elements.getJSONObject(index);
            if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                return element.optBoolean("disabled") ? "disabled" : "enabled";
            }
        }
        return "missing";
    }

    private static boolean isTargetVisible(
        Instrumentation instrumentation, WebView webView, String testId
    ) throws Exception {
        return !"missing".equals(targetState(instrumentation, webView, testId));
    }
}
