package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionExistingPairSyncEvidence {
    private FolioleCompanionExistingPairSyncEvidence() {}

    static JSONObject awaitAutomatic(
        Instrumentation instrumentation,
        WebView webView,
        long deadline,
        String syncTarget
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionPairSyncEvidence.read(instrumentation, webView);
            FolioleCompanionPairSyncEvidence.emit(instrumentation, state);
            String runId = state.optString("autoSyncRunId");
            String result = state.optString("autoSyncResult");
            if (!runId.isEmpty() && !result.isEmpty()
                && isTargetEnabled(instrumentation, webView, syncTarget)) {
                JSONObject evidence = completedRunEvidence(
                    FolioleCompanionPairSyncEvidence.terminalEvidence(state), runId, result
                );
                evidence.put("autoSyncResult", result);
                evidence.put("autoSyncRunId", runId);
                evidence.put("preExistingAttention", state.optBoolean("preExistingAttention"));
                return evidence;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for cold-start automatic sync completion.");
    }

    static JSONObject await(
        Instrumentation instrumentation,
        WebView webView,
        long deadline,
        String syncTarget
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionPairSyncEvidence.read(instrumentation, webView);
            JSONObject evidence = FolioleCompanionPairSyncEvidence.terminalEvidence(state);
            FolioleCompanionPairSyncEvidence.emit(instrumentation, state);
            if ("failed".equals(evidence.optString("initialSync"))) {
                throw new IllegalStateException(
                    "Existing workspace sync failed: " + boundedSyncFailure(state) + "."
                );
            }
            boolean targetEnabled = isTargetEnabled(instrumentation, webView, syncTarget);
            String runId = state.optString("manualSyncRunId");
            String result = state.optString("manualSyncResult");
            if (!runId.isEmpty() && !result.isEmpty() && targetEnabled) {
                return exactRunEvidence(state, evidence, runId, result);
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for existing workspace sync completion.");
    }

    private static JSONObject exactRunEvidence(
        JSONObject state,
        JSONObject evidence,
        String runId,
        String result
    ) throws Exception {
        completedRunEvidence(evidence, runId, result);
        evidence.put("manualSyncMode", state.optString("manualSyncMode"));
        evidence.put("manualSyncResult", result);
        evidence.put("manualSyncRunId", runId);
        evidence.put("preExistingAttention", state.optBoolean("preExistingAttention"));
        return evidence;
    }

    private static JSONObject completedRunEvidence(
        JSONObject evidence,
        String runId,
        String result
    ) throws Exception {
        if (!"completed".equals(result)) {
            throw new IllegalStateException(
                "Existing workspace sync run " + runId + " settled as " + result + "."
            );
        }
        evidence.put("initialSync", result);
        return evidence;
    }

    static JSONObject awaitAfterStructureApplied(
        Instrumentation instrumentation,
        WebView webView,
        long deadline,
        JSONObject evidence
    ) throws Exception {
        String lastTargetState = "missing";
        boolean restoredSyncSurface = false;
        boolean syncStarted = false;
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionPairSyncEvidence.read(instrumentation, webView);
            lastTargetState = targetState(instrumentation, webView, "companion-sync-now");
            if (state.optBoolean("syncPackApplied") && "disabled".equals(lastTargetState)) {
                syncStarted = true;
            }
            if (state.optBoolean("syncPackApplied") && syncStarted && "enabled".equals(lastTargetState)) {
                evidence.put("initialSync", "completed");
                return evidence;
            }
            if (state.optBoolean("syncPackApplied") && "missing".equals(lastTargetState)
                && !restoredSyncSurface) {
                restoreSyncSurface(instrumentation, webView, deadline);
                restoredSyncSurface = true;
            }
            if (isTargetVisible(instrumentation, webView, "companion-sync-inline-attention")) {
                throw new IllegalStateException("Initial workspace sync settled with attention.");
            }
            isTargetVisible(instrumentation, webView, "companion-sync-inline-progress");
            Thread.sleep(150);
        }
        throw new IllegalStateException(
            "Timed out waiting for initial workspace sync settlement: target_" + lastTargetState + "."
        );
    }

    private static void restoreSyncSurface(
        Instrumentation instrumentation, WebView webView, long deadline
    ) throws Exception {
        String entry = FolioleCompanionPairSyncRecoveryScenario.waitForAnyVisible(
            instrumentation, webView, deadline,
            "companion-tab-settings", "companion-top-bar-left-action"
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

    private static String boundedSyncFailure(JSONObject state) {
        String failure = state.optString("syncFailure", "unknown");
        return failure.matches("sync-push-http-[0-9]{3}(?:-[a-z_]+)?") ? failure : "unknown";
    }
}
