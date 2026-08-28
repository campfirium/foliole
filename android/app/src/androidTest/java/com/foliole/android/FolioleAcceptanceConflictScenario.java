package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleAcceptanceConflictScenario {
    private static final String NOTE_TEXT = "Note target beta";

    private FolioleAcceptanceConflictScenario() {}

    static JSONObject forkExistingTopic(
        Instrumentation instrumentation, WebView webView, String token, long timeoutMs
    ) throws Exception {
        String resolvedToken = token.isEmpty()
            ? uniqueConflictToken(instrumentation, webView, timeoutMs) : token;
        FolioleCompanionCaptureAnnotationScenario.assertToken(resolvedToken);
        FolioleCompanionCaptureAnnotationScenario.navigateToCapturedTopic(
            instrumentation, webView, resolvedToken, timeoutMs
        );
        FolioleCompanionCaptureAnnotationScenario.waitForText(
            instrumentation, webView, NOTE_TEXT, timeoutMs
        );
        FolioleCompanionCaptureAnnotationScenario.createNote(
            instrumentation, webView, resolvedToken, timeoutMs
        );
        return new JSONObject().put("conflictForkPersisted", true)
            .put("targetTestId", "companion-conflict-fork").put("token", resolvedToken);
    }

    private static String uniqueConflictToken(
        Instrumentation instrumentation, WebView webView, long timeoutMs
    ) throws Exception {
        FolioleCompanionCaptureNavigation.openDirectorySurface(instrumentation, webView, timeoutMs);
        FolioleCompanionCaptureAnnotationScenario.perform(
            instrumentation, webView, "companion-directory-node-special-inbox", "click", ""
        );
        String script = "(function(){var values=Array.prototype.slice.call(document.querySelectorAll(" +
            "'button[data-testid^=\"companion-directory-node-\"]')).map(function(node){" +
            "var match=(node.innerText||'').match(/t152-conflict-[0-9]{17}/);" +
            "return match?match[0]:null;}).filter(Boolean);var unique=values.filter(function(value,index){" +
            "return values.indexOf(value)===index;});return JSON.stringify({count:unique.length," +
            "token:unique.length===1?unique[0]:''});})()";
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = FolioleCompanionCaptureAnnotationScenario.evaluate(
                instrumentation, webView, script
            );
            if (latest.optInt("count") == 1) return latest.getString("token");
            if (latest.optInt("count") > 1) break;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Expected exactly one visible conflict seed: " + latest);
    }
}
