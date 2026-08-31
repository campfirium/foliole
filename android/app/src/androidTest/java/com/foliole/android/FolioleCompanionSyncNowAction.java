package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncNowAction {
    private static final String TEST_ID = "companion-sync-now";
    private static final long TERMINAL_TIMEOUT_MS = TimeUnit.MINUTES.toMillis(2);

    private FolioleCompanionSyncNowAction() {}

    static JSONObject perform(Instrumentation instrumentation, WebView webView) throws Exception {
        JSONObject before = readState(instrumentation, webView);
        waitUntilEnabled(instrumentation, webView, 30_000);
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, TEST_ID, "click", ""
        );
        if (!receipt.optBoolean("ok")) throw new IllegalStateException(receipt.toString());
        JSONObject started = waitUntilStarted(
            instrumentation, webView, before.optString("runId"), 30_000
        );
        JSONObject terminal = waitUntilTerminal(
            instrumentation, webView, started.getString("runId"), TERMINAL_TIMEOUT_MS
        );
        return receipt.put("syncRequested", true)
            .put("actionStarted", true)
            .put("actionRunId", started.getString("runId"))
            .put("terminalRunId", terminal.getString("terminalRunId"))
            .put("terminalResult", terminal.getString("terminalResult"))
            .put("errorText", terminal.optString("errorText"));
    }

    private static JSONObject readState(
        Instrumentation instrumentation, WebView webView
    ) throws Exception {
        String script = "(function(){var node=document.querySelector(" +
            "'[data-testid=\"companion-sync-now\"]');return JSON.stringify({" +
            "found:!!node,disabled:node?!!node.disabled:true," +
            "runId:node?(node.getAttribute('data-sync-action-run-id')||''):''," +
            "started:node?node.getAttribute('data-sync-action-started')==='true':false," +
            "status:node?(node.getAttribute('data-sync-action-status')||''):''," +
            "terminalRunId:node?(node.getAttribute('data-sync-action-terminal-run-id')||''):''," +
            "terminalResult:node?(node.getAttribute('data-sync-action-terminal-result')||''):''," +
            "errorText:Array.from(document.querySelectorAll('.text-error'))" +
            ".map(function(item){return item.textContent||'';}).filter(Boolean).join(' | ')});})()";
        return FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView, script);
    }

    private static void waitUntilEnabled(
        Instrumentation instrumentation, WebView webView, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            JSONObject state = readState(instrumentation, webView);
            if (state.optBoolean("found") && !state.optBoolean("disabled")) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for public Sync Now.");
    }

    private static JSONObject waitUntilStarted(
        Instrumentation instrumentation, WebView webView, String previousRunId, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = readState(instrumentation, webView);
            String runId = latest.optString("runId");
            String status = latest.optString("status");
            if (!runId.isEmpty() && !runId.equals(previousRunId) && latest.optBoolean("started")
                && ("running".equals(status) || "terminal".equals(status))) return latest;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for clicked Sync Now run: " + latest);
    }

    private static JSONObject waitUntilTerminal(
        Instrumentation instrumentation, WebView webView, String runId, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = readState(instrumentation, webView);
            if (runId.equals(latest.optString("runId"))
                && "terminal".equals(latest.optString("status"))
                && runId.equals(latest.optString("terminalRunId"))) return latest;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for Sync Now terminal: " + latest);
    }
}
