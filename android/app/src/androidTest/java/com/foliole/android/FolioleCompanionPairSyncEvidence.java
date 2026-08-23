package com.foliole.android;

import android.app.Instrumentation;
import android.os.Bundle;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

final class FolioleCompanionPairSyncEvidence {
    private static final String OBSERVER_ASSET = "foliole-pair-sync-evidence-observer.js";

    private FolioleCompanionPairSyncEvidence() {}

    static JSONObject install(
        Instrumentation instrumentation,
        WebView webView,
        boolean existingPairing
    ) throws Exception {
        JSONObject installed = FolioleCompanionWebViewSemanticAdapter.evaluateJson(
            instrumentation,
            webView,
            readObserverScript(instrumentation)
        );
        if (!installed.optBoolean("ok") || !existingPairing) return installed;
        String script = "(function(){var state=window.__foliolePairSyncObserver;" +
            "if(!state)return JSON.stringify({ok:false});" +
            "state.completion='existing_pairing';state.credentials='saved_not_signable';" +
            "return JSON.stringify({ok:true});})()";
        return FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView, script);
    }

    private static String readObserverScript(Instrumentation instrumentation) throws Exception {
        try (InputStream input = instrumentation.getContext().getAssets().open(OBSERVER_ASSET);
             Scanner scanner = new Scanner(input, StandardCharsets.UTF_8.name()).useDelimiter("\\A")) {
            if (!scanner.hasNext()) throw new IllegalStateException("Pair sync observer asset is empty.");
            return scanner.next();
        }
    }

    static JSONObject read(Instrumentation instrumentation, WebView webView) throws Exception {
        String script = "(function(){var state=window.__foliolePairSyncObserver;return JSON.stringify({" +
            "observerReady:!!state,keyState:state?state.keyState:'unavailable'," +
            "requestState:state?state.requestState:'unavailable'," +
            "completion:state?state.completion:'not_started'," +
            "credentials:state?state.credentials:'not_saved'," +
            "initialSync:state?state.initialSync:'not_started'," +
            "syncFailure:state?state.syncFailure:null,syncPackUrl:state?state.syncPackUrl:null," +
            "syncPackApplied:!!(state&&state.syncPackApplied)," +
            "syncPackDownloaded:!!(state&&state.syncPackDownloaded)," +
            "autoSyncResult:state?state.autoSyncResult:null," +
            "autoSyncRunId:state?state.autoSyncRunId:null," +
            "autoSyncStarted:!!(state&&state.autoSyncStarted)," +
            "manualSyncMode:state?state.manualSyncMode:null," +
            "manualSyncResult:state?state.manualSyncResult:null," +
            "manualSyncRunId:state?state.manualSyncRunId:null," +
            "preExistingAttention:!!(state&&state.preExistingAttention)," +
            "pairFound:!!document.querySelector('[data-testid=\"companion-sync-pair\"]')," +
            "discoverFound:!!document.querySelector('[data-testid=\"companion-sync-discover\"]')," +
            "connectedFound:!!document.querySelector('[data-testid=\"companion-sync-now\"]')});})()";
        return FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView, script);
    }

    static void resetExistingSync(Instrumentation instrumentation, WebView webView) throws Exception {
        String script = "(function(){var state=window.__foliolePairSyncObserver;" +
            "if(!state)return JSON.stringify({ok:false});" +
            "state.initialSync='not_started';state.syncFailure=null;" +
            "state.syncPackApplied=false;state.syncPackDownloaded=false;" +
            "state.manualSyncMode=null;state.manualSyncResult=null;state.manualSyncRunId=null;" +
            "state.preExistingAttention=state.preExistingAttention||!!document.querySelector(" +
            "'[data-testid=\"companion-sync-inline-attention\"]');" +
            "return JSON.stringify({ok:true});})()";
        JSONObject reset = FolioleCompanionWebViewSemanticAdapter.evaluateJson(
            instrumentation, webView, script
        );
        if (!reset.optBoolean("ok")) {
            throw new IllegalStateException("Pair sync observer could not reset existing sync evidence.");
        }
    }

    static void emit(Instrumentation instrumentation, JSONObject state) {
        Bundle evidence = new Bundle();
        evidence.putString("foliolePairSyncEvidence", terminalEvidence(state).toString());
        instrumentation.sendStatus(2, evidence);
    }

    static JSONObject terminalEvidence(JSONObject state) {
        JSONObject evidence = new JSONObject();
        try {
            evidence.put("completion", state.optString("completion", "not_started"));
            evidence.put("credentials", state.optString("credentials", "not_saved"));
            evidence.put("initialSync", state.optString("initialSync", "not_started"));
            String failure = state.optString("syncFailure", "");
            if (failure.matches("^pair-completion-(?:transport-failed|http-[0-9]{3}(?:-[a-z_]+)?)$")) {
                evidence.put("failure", failure);
            }
        } catch (Exception error) {
            throw new IllegalStateException("Pair sync evidence could not be encoded.", error);
        }
        return evidence;
    }
}
