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
        JSONObject observer = FolioleCompanionWebViewSemanticAdapter.installPairSyncObserver(
            instrumentation, webView, reusedPairing
        );
        if (!observer.optBoolean("ok")) {
            throw new IllegalStateException("Pair sync observer is unavailable.");
        }
        if (!reusedPairing) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "discovery-request");
            clickVisible(instrumentation, webView, "companion-sync-discover", deadline);
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-target");
            waitForUniqueVisible(instrumentation, webView, "companion-sync-pair", deadline);
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-request");
            clickVisible(instrumentation, webView, "companion-sync-pair", deadline);
            FolioleCompanionPairRequestEvidence.awaitSubmission(instrumentation, webView, deadline);
        } else {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "initial-sync-request");
            clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline);
        }
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-completion");
        JSONObject recoveryEvidence = awaitRecoveryEvidence(instrumentation, webView, deadline);
        JSONObject receipt = new JSONObject();
        receipt.put("ok", true);
        receipt.put("targetTestId", "companion-pair-sync-recovery");
        receipt.put("paired", true);
        receipt.put("pairingPath", reusedPairing ? "existing" : "new");
        receipt.put("initialSyncRequested", true);
        receipt.put("completion", recoveryEvidence.getString("completion"));
        receipt.put("credentials", recoveryEvidence.getString("credentials"));
        receipt.put("initialSync", recoveryEvidence.getString("initialSync"));
        return receipt;
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

    private static JSONObject awaitRecoveryEvidence(
        Instrumentation instrumentation,
        WebView webView,
        long deadline
    ) throws Exception {
        String lastEvidence = "";
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionPairSyncEvidence.read(instrumentation, webView);
            JSONObject evidence = FolioleCompanionPairSyncEvidence.terminalEvidence(state);
            if (!evidence.toString().equals(lastEvidence)) {
                FolioleCompanionPairSyncEvidence.emit(instrumentation, state);
                emitRecoveryStage(instrumentation, evidence);
                lastEvidence = evidence.toString();
            }
            validateRecoveryState(state, evidence);
            if ("completed".equals(evidence.optString("initialSync"))
                && state.optBoolean("connectedFound")) return evidence;
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for initial workspace sync completion.");
    }

    private static void validateRecoveryState(JSONObject state, JSONObject evidence) {
        String completion = evidence.optString("completion");
        String credentials = evidence.optString("credentials");
        String initialSync = evidence.optString("initialSync");
        if (!isOneOf(completion, "not_started", "dispatched", "transport_failed", "http_rejected", "http_200", "existing_pairing")
            || !isOneOf(credentials, "not_saved", "save_failed", "saved_not_signable", "saved_signable")
            || !isOneOf(initialSync, "not_started", "started", "failed", "completed")) {
            throw new IllegalStateException("Pair sync recovery emitted an unknown evidence state.");
        }
        if (!"http_200".equals(completion) && !"existing_pairing".equals(completion)
            && (!"not_saved".equals(credentials) || !"not_started".equals(initialSync))) {
            throw new IllegalStateException("Pair sync recovery evidence advanced before completion.");
        }
        if (!"saved_signable".equals(credentials) && !"not_started".equals(initialSync)) {
            throw new IllegalStateException("Initial sync advanced before credentials were signable.");
        }
        if ("save_failed".equals(credentials) || "failed".equals(initialSync)) {
            throw new IllegalStateException("Pair sync recovery persisted a terminal failure state.");
        }
        if (state.optBoolean("pairFound")) {
            throw new IllegalStateException("Pairing completion returned to Pair target.");
        }
        if (state.optBoolean("discoverFound")) {
            throw new IllegalStateException("Pairing completion returned to discovery.");
        }
    }

    private static void emitRecoveryStage(Instrumentation instrumentation, JSONObject evidence) {
        if ("completed".equals(evidence.optString("initialSync"))) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "initial-sync-completed");
        } else if ("started".equals(evidence.optString("initialSync"))) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "initial-sync-started");
        } else if ("saved_signable".equals(evidence.optString("credentials"))) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "credentials-signable");
        } else if ("saved_not_signable".equals(evidence.optString("credentials"))) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "credentials-saved");
        } else if ("http_200".equals(evidence.optString("completion"))) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-completion-http-200");
        } else if ("dispatched".equals(evidence.optString("completion"))) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-completion-dispatched");
        }
    }

    private static boolean isOneOf(String value, String... allowed) {
        for (String item : allowed) if (item.equals(value)) return true;
        return false;
    }
}
