package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

final class FolioleCompanionPairRequestEvidence {
    private FolioleCompanionPairRequestEvidence() {}

    static void awaitSubmission(
        Instrumentation instrumentation,
        WebView webView,
        long deadline
    ) throws Exception {
        String lastStage = "";
        String lastEvidence = "";
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionWebViewSemanticAdapter.pairingRequestState(
                instrumentation, webView
            );
            String evidence = FolioleCompanionPairSyncEvidence.terminalEvidence(state).toString();
            if (!evidence.equals(lastEvidence)) {
                FolioleCompanionPairSyncEvidence.emit(instrumentation, state);
                lastEvidence = evidence;
            }
            validateTerminalState(state);
            String stage = resolveStage(state.optString("keyState"), state.optString("requestState"));
            if (!stage.isEmpty() && !stage.equals(lastStage)) {
                FolioleCompanionPairSyncHostEvidence.stage(instrumentation, stage);
                lastStage = stage;
            }
            if (isAwaitingApproval(state)) {
                FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-request-awaiting");
                return;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for pairing request submission.");
    }

    private static void validateTerminalState(JSONObject state) {
        if (!state.optBoolean("observerReady")) {
            throw new IllegalStateException("Pairing request observer is unavailable.");
        }
        if ("failed".equals(state.optString("keyState"))) {
            throw new IllegalStateException("Pairing request failed: key_generation_failed");
        }
        String requestState = state.optString("requestState");
        if ("failed".equals(requestState)) {
            throw new IllegalStateException("Pairing request failed: request_transport_failed");
        }
        if ("rejected".equals(requestState)) {
            throw new IllegalStateException("Pairing request failed: request_rejected");
        }
    }

    private static boolean isAwaitingApproval(JSONObject state) {
        return "accepted".equals(state.optString("requestState"))
            && !state.optBoolean("pairFound") && !state.optBoolean("discoverFound");
    }

    private static String resolveStage(String keyState, String requestState) {
        if ("accepted".equals(requestState)) return "pair-request-accepted";
        if ("dispatched".equals(requestState)) return "pair-request-dispatched";
        if ("completed".equals(keyState)) return "pair-request-key-ready";
        if ("started".equals(keyState)) return "pair-request-key-started";
        return "";
    }
}
