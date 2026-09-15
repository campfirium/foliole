package com.foliole.android;

import android.app.Instrumentation;
import android.database.sqlite.SQLiteReadOnlyDatabaseException;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncNowAction {
    private static final String TEST_ID = "companion-sync-now";
    private static final long TERMINAL_TIMEOUT_MS = TimeUnit.MINUTES.toMillis(2);

    private FolioleCompanionSyncNowAction() {}

    static JSONObject perform(Instrumentation instrumentation, WebView webView) throws Exception {
        JSONObject before = readState(instrumentation, webView);
        waitUntilEnabled(instrumentation, webView, TERMINAL_TIMEOUT_MS);
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, TEST_ID, "click", ""
        );
        if (!receipt.optBoolean("ok")) throw new IllegalStateException(receipt.toString());
        JSONObject started = waitUntilStarted(
            instrumentation, webView, before.optString("runId"), 30_000
        );
        JSONObject terminal = waitUntilTerminal(instrumentation, webView, TERMINAL_TIMEOUT_MS);
        requireCompletedTerminal(instrumentation, terminal);
        waitUntilProjected(instrumentation, terminal.getString("terminalRunId"));
        return receipt.put("syncRequested", true)
            .put("actionStarted", true)
            .put("actionRunId", terminal.getString("runId"))
            .put("terminalRunId", terminal.getString("terminalRunId"))
            .put("terminalResult", terminal.getString("terminalResult"))
            .put("errorText", terminal.optString("errorText"));
    }

    private static void requireCompletedTerminal(
        Instrumentation instrumentation, JSONObject terminal
    ) throws Exception {
        if ("completed".equals(terminal.optString("terminalResult"))) return;
        throw new IllegalStateException(
            "Sync Now failed before projection: " + terminal
                + "; discovery=" + diagnoseDiscovery(instrumentation)
        );
    }

    private static JSONArray diagnoseDiscovery(Instrumentation instrumentation) throws Exception {
        JSONArray results = new JSONArray();
        String endpointKey = FolioleCompanionHostBridgeContractDefinitions
            .networkEndpointUrlCandidateKey(instrumentation.getTargetContext());
        for (JSONObject candidate : FolioleCompanionNsdDiscovery.discoverCandidates(
            instrumentation.getTargetContext()
        )) {
            JSONObject result = new JSONObject().put("candidate", candidate);
            String endpoint = candidate.optString(endpointKey);
            try {
                result.put("http", FolioleCompanionDesktopHttpClient.request(
                    instrumentation.getTargetContext(), endpoint + "/companion/discovery",
                    "GET", null, null
                ));
            } catch (Exception error) {
                result.put("http_error", String.valueOf(error));
            }
            results.put(result);
        }
        return results;
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

    static void waitUntilEnabled(
        Instrumentation instrumentation, WebView webView, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = readState(instrumentation, webView);
            if (latest.optBoolean("found") && !latest.optBoolean("disabled")) {
                Thread.sleep(500);
                JSONObject stable = readState(instrumentation, webView);
                if (stable.optBoolean("found") && !stable.optBoolean("disabled")) return;
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for public Sync Now: " + latest);
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
        Instrumentation instrumentation, WebView webView, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = readState(instrumentation, webView);
            String runId = latest.optString("runId");
            if (!runId.isEmpty() && "terminal".equals(latest.optString("status"))
                && runId.equals(latest.optString("terminalRunId"))) return latest;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for Sync Now terminal: " + latest);
    }

    private static void waitUntilProjected(
        Instrumentation instrumentation, String runId
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(30_000);
        SQLiteReadOnlyDatabaseException lastReadConflict = null;
        JSONObject latestProjection = new JSONObject();
        while (System.nanoTime() < deadline) {
            try {
                latestProjection = FolioleAcceptanceSyncEventProjection.read(
                    instrumentation.getTargetContext()
                );
                JSONArray events = latestProjection.getJSONArray("events");
                for (int index = 0; index < events.length(); index += 1) {
                    if (runId.equals(events.getJSONObject(index).optString("run_id"))) return;
                }
            } catch (SQLiteReadOnlyDatabaseException error) {
                lastReadConflict = error;
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException(
            "Timed out waiting for projected Sync Now run: " + runId
                + "; latestProjection=" + latestProjection,
            lastReadConflict
        );
    }
}
