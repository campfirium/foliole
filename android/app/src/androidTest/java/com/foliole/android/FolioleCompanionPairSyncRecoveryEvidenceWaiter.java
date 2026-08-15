package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

final class FolioleCompanionPairSyncRecoveryEvidenceWaiter {
    private FolioleCompanionPairSyncRecoveryEvidenceWaiter() {}

    static JSONObject await(
        Instrumentation instrumentation, WebView webView, long deadline, boolean credentialsOnly
    ) throws Exception {
        String lastEvidence = "";
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionPairSyncEvidence.read(instrumentation, webView);
            JSONObject evidence = FolioleCompanionPairSyncEvidence.terminalEvidence(state);
            if (!state.toString().equals(lastEvidence)) {
                FolioleCompanionPairSyncEvidence.emit(instrumentation, state);
                emitStage(instrumentation, state, evidence);
                lastEvidence = state.toString();
            }
            validate(state, evidence);
            if (credentialsOnly && "saved_signable".equals(evidence.optString("credentials"))) {
                return evidence;
            }
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

    private static void validate(JSONObject state, JSONObject evidence) {
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

    private static void emitStage(Instrumentation instrumentation, JSONObject state, JSONObject evidence) {
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
