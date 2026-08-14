package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionPairSyncRecoveryScenario {
    private static final String CONNECTED_TARGET = "companion-sync-now";
    private static final String REVIEW_EXIT_TARGET = "companion-top-bar-left-action";
    private static final String SETTINGS_TARGET = "companion-tab-settings";

    private FolioleCompanionPairSyncRecoveryScenario() {}
    static JSONObject run(
        Instrumentation instrumentation, WebView webView,
        boolean forceRePair, String expectedEndpointUrl, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "settings-tab");
        String settingsEntry = waitForAnyVisible(
            instrumentation, webView, deadline, SETTINGS_TARGET, REVIEW_EXIT_TARGET
        );
        if (REVIEW_EXIT_TARGET.equals(settingsEntry)) {
            clickVisible(instrumentation, webView, REVIEW_EXIT_TARGET, deadline);
        }
        clickVisible(instrumentation, webView, SETTINGS_TARGET, deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-settings");
        clickVisible(instrumentation, webView, "companion-settings-sync", deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-entry");
        String entry = waitForAnyVisible(
            instrumentation, webView, deadline,
            "companion-sync-now", "companion-sync-discover", "companion-sync-repair"
        );
        boolean existingPairing = CONNECTED_TARGET.equals(entry);
        JSONObject observer = FolioleCompanionWebViewSemanticAdapter.installPairSyncObserver(
            instrumentation, webView, existingPairing && !forceRePair
        );
        if (!observer.optBoolean("ok")) {
            throw new IllegalStateException("Pair sync observer is unavailable.");
        }
        if (existingPairing && forceRePair) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "existing-pair-disconnect");
            clickVisible(instrumentation, webView, "companion-sync-connection", deadline);
            clickVisible(instrumentation, webView, "companion-sync-disconnect", deadline);
            waitForUniqueVisible(instrumentation, webView, "companion-sync-discover", deadline);
            existingPairing = false;
        } else if (existingPairing) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "existing-pair-push");
            clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline);
            FolioleCompanionExistingPairSyncEvidence.await(
                instrumentation, webView, deadline, CONNECTED_TARGET
            );
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "existing-pair-ack-pull");
            clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline);
            return buildReceipt(FolioleCompanionExistingPairSyncEvidence.await(
                instrumentation, webView, deadline, CONNECTED_TARGET
            ), "existing");
        }
        if ("companion-sync-repair".equals(entry)) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "existing-pair-disconnect");
            clickVisible(instrumentation, webView, "companion-sync-repair", deadline);
            waitForUniqueVisible(instrumentation, webView, "companion-sync-discover", deadline);
        }
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "discovery-request");
        clickVisible(instrumentation, webView, "companion-sync-discover", deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-target");
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-request");
        FolioleCompanionWebViewSemanticAdapter.clickUniqueVisibleMatchingAttribute(
            instrumentation, webView, "companion-sync-pair", "data-sync-endpoint",
            expectedEndpointUrl, deadline
        );
        FolioleCompanionPairRequestEvidence.awaitSubmission(instrumentation, webView, deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-completion");
        JSONObject recoveryEvidence = awaitRecoveryEvidence(instrumentation, webView, deadline);
        return buildReceipt(recoveryEvidence, "new");
    }

    private static JSONObject buildReceipt(JSONObject recoveryEvidence, String pairingPath) throws Exception {
        JSONObject receipt = new JSONObject();
        receipt.put("ok", true);
        receipt.put("targetTestId", "companion-pair-sync-recovery");
        receipt.put("paired", true);
        receipt.put("pairingPath", pairingPath);
        receipt.put("initialSyncRequested", true);
        receipt.put("completion", recoveryEvidence.getString("completion"));
        receipt.put("credentials", recoveryEvidence.getString("credentials"));
        receipt.put("initialSync", recoveryEvidence.getString("initialSync"));
        return receipt;
    }

    static void clickVisible(
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

    static void waitForUniqueVisible(
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

    static String waitForAnyVisible(
        Instrumentation instrumentation,
        WebView webView,
        long deadline,
        String... targets
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONArray elements = FolioleCompanionWebViewSemanticAdapter
                .snapshot(instrumentation, webView).getJSONArray("elements");
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (element.optBoolean("visible")) {
                    String testId = element.optString("testId");
                    for (String target : targets) if (target.equals(testId)) return testId;
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
            if (!state.toString().equals(lastEvidence)) {
                FolioleCompanionPairSyncEvidence.emit(instrumentation, state);
                emitRecoveryStage(instrumentation, state, evidence);
                lastEvidence = state.toString();
            }
            validateRecoveryState(state, evidence);
            if (state.optBoolean("syncPackApplied")) {
                JSONObject settled = FolioleCompanionExistingPairSyncEvidence.awaitAfterStructureApplied(
                    instrumentation, webView, deadline, evidence
                );
                FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "initial-sync-completed");
                return settled;
            }
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
        if (!"saved_signable".equals(credentials) && !"not_started".equals(initialSync)
            && !"existing_pairing".equals(completion)) {
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

    private static void emitRecoveryStage(Instrumentation instrumentation, JSONObject state, JSONObject evidence) {
        if ("completed".equals(evidence.optString("initialSync"))) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "initial-sync-completed");
        } else if (state.optBoolean("syncPackApplied")) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "structure-pack-applied");
        } else if (state.optBoolean("syncPackDownloaded")) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "structure-pack-downloaded");
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
