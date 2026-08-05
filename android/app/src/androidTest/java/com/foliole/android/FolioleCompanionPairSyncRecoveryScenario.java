package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionPairSyncRecoveryScenario {
    private static final String CONNECTED_TARGET = "companion-sync-now";

    private FolioleCompanionPairSyncRecoveryScenario() {}

    static JSONObject run(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "settings-tab");
        clickVisible(instrumentation, webView, "companion-tab-settings", deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-settings");
        clickVisible(instrumentation, webView, "companion-settings-sync", deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-entry");
        String entry = waitForEitherVisible(
            instrumentation, webView, "companion-sync-now", "companion-sync-discover", deadline
        );
        boolean reusedPairing = CONNECTED_TARGET.equals(entry);
        if (!reusedPairing) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "discovery-request");
            clickVisible(instrumentation, webView, "companion-sync-discover", deadline);
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-target");
            waitForUniqueVisible(instrumentation, webView, "companion-sync-pair", deadline);
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-request");
            clickVisible(instrumentation, webView, "companion-sync-pair", deadline);
            waitForPairRequestSubmission(instrumentation, webView, deadline);
        }
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "initial-sync");
        waitForCompletedSync(instrumentation, webView, deadline);
        JSONObject receipt = new JSONObject();
        receipt.put("ok", true);
        receipt.put("targetTestId", "companion-pair-sync-recovery");
        receipt.put("paired", true);
        receipt.put("pairingPath", reusedPairing ? "existing" : "new");
        receipt.put("initialSyncRequested", true);
        return receipt;
    }

    private static void waitForPairRequestSubmission(
        Instrumentation instrumentation,
        WebView webView,
        long deadline
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionWebViewSemanticAdapter.pairingRequestState(
                instrumentation, webView
            );
            String errorReason = state.optString("errorReason");
            if (!errorReason.isEmpty()) {
                throw new IllegalStateException("Pairing request failed: " + errorReason);
            }
            if (!state.optBoolean("pairFound")) {
                FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-request-submitted");
                return;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for pairing request submission.");
    }

    private static void clickVisible(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long deadline
    ) throws Exception {
        waitForUniqueVisible(instrumentation, webView, testId, deadline);
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, testId, "click", ""
        );
        if (!receipt.optBoolean("ok")) {
            throw new IllegalStateException("Semantic action failed: " + receipt);
        }
    }

    private static void waitForUniqueVisible(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long deadline
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONArray elements = FolioleCompanionWebViewSemanticAdapter
                .snapshot(instrumentation, webView).getJSONArray("elements");
            int visible = 0;
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                    visible += 1;
                }
            }
            if (visible == 1) return;
            if (visible > 1) throw new IllegalStateException("Pairing target is not unique: " + testId);
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for semantic target: " + testId);
    }

    private static String waitForEitherVisible(
        Instrumentation instrumentation,
        WebView webView,
        String first,
        String second,
        long deadline
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONArray elements = FolioleCompanionWebViewSemanticAdapter
                .snapshot(instrumentation, webView).getJSONArray("elements");
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (element.optBoolean("visible")) {
                    String testId = element.optString("testId");
                    if (first.equals(testId) || second.equals(testId)) return testId;
                }
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for pairing or sync entry.");
    }

    private static void waitForCompletedSync(
        Instrumentation instrumentation,
        WebView webView,
        long deadline
    ) throws Exception {
        JSONObject target = waitForConnectedTarget(instrumentation, webView, deadline);
        if (!target.optBoolean("disabled")) {
            clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline);
        }
        boolean observedSyncing = false;
        while (System.nanoTime() < deadline) {
            target = uniqueVisibleTarget(instrumentation, webView, CONNECTED_TARGET);
            observedSyncing = observedSyncing || target.optBoolean("disabled");
            if (observedSyncing && !target.optBoolean("disabled")) return;
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for initial workspace sync completion.");
    }

    private static JSONObject waitForConnectedTarget(
        Instrumentation instrumentation,
        WebView webView,
        long deadline
    ) throws Exception {
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "initial-sync-awaiting");
        while (System.nanoTime() < deadline) {
            JSONObject request = FolioleCompanionWebViewSemanticAdapter.pairingRequestState(
                instrumentation, webView
            );
            if (request.optBoolean("pairFound")) {
                FolioleCompanionPairSyncHostEvidence.stage(
                    instrumentation, "initial-sync-pair-target-returned"
                );
                throw new IllegalStateException("Pairing completion returned to Pair target.");
            }
            String errorReason = request.optString("errorReason");
            if (!errorReason.isEmpty()) {
                throw new IllegalStateException("Pairing completion failed: " + errorReason);
            }
            JSONObject target = visibleTarget(instrumentation, webView, CONNECTED_TARGET);
            if (target != null) return target;
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for semantic target: " + CONNECTED_TARGET);
    }

    private static JSONObject uniqueVisibleTarget(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        JSONArray elements = FolioleCompanionWebViewSemanticAdapter
            .snapshot(instrumentation, webView).getJSONArray("elements");
        JSONObject match = visibleTarget(elements, testId);
        if (match == null) throw new IllegalStateException("Pairing target disappeared: " + testId);
        return match;
    }

    private static JSONObject visibleTarget(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        JSONArray elements = FolioleCompanionWebViewSemanticAdapter
            .snapshot(instrumentation, webView).getJSONArray("elements");
        return visibleTarget(elements, testId);
    }

    private static JSONObject visibleTarget(JSONArray elements, String testId) throws Exception {
        JSONObject match = null;
        for (int index = 0; index < elements.length(); index += 1) {
            JSONObject element = elements.getJSONObject(index);
            if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                if (match != null) throw new IllegalStateException("Pairing target is not unique: " + testId);
                match = element;
            }
        }
        return match;
    }
}
