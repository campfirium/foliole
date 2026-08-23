package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

final class FolioleCompanionPairSyncRecoveryEvidenceWaiter {
    private FolioleCompanionPairSyncRecoveryEvidenceWaiter() {}

    static JSONObject await(
        Instrumentation instrumentation, WebView webView, long deadline
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
            if ("saved_signable".equals(evidence.optString("credentials"))) {
                return evidence;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for signable pairing credentials.");
    }

    private static void validate(JSONObject state, JSONObject evidence) {
        String completion = evidence.optString("completion");
        String credentials = evidence.optString("credentials");
        if (!isOneOf(completion, "not_started", "dispatched", "transport_failed", "http_rejected", "http_200", "existing_pairing")
            || !isOneOf(credentials, "not_saved", "save_failed", "saved_not_signable", "saved_signable")) {
            throw new IllegalStateException("Pair sync recovery emitted an unknown evidence state.");
        }
        if (!"http_200".equals(completion) && !"existing_pairing".equals(completion)
            && !"not_saved".equals(credentials)) {
            throw new IllegalStateException("Pair sync recovery evidence advanced before completion.");
        }
        if ("save_failed".equals(credentials)) {
            throw new IllegalStateException("Pair sync recovery persisted a terminal failure state: "
                + state.optString("syncFailure", "unknown"));
        }
        if (state.optBoolean("pairFound")) {
            throw new IllegalStateException("Pairing completion returned to Pair target.");
        }
        if (state.optBoolean("discoverFound")) {
            throw new IllegalStateException("Pairing completion returned to discovery.");
        }
    }

    private static void emitStage(Instrumentation instrumentation, JSONObject state, JSONObject evidence) {
        if ("saved_signable".equals(evidence.optString("credentials"))) {
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
