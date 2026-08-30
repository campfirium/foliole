package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

final class FolioleCompanionOrdinaryJourneyScenario {
    private static final String SCENARIO_ID = "companion-ordinary-journey";
    private static final String INBOX_NODE = "companion-directory-node-special-inbox";
    private static final String[] BROWSE_ENTRIES = {
        "companion-top-bar-back", "companion-reading-exit", "companion-tab-shortcut",
        "companion-tab-browse", "companion-top-bar-left-action"
    };

    private FolioleCompanionOrdinaryJourneyScenario() {}

    static JSONObject create(
        Instrumentation instrumentation,
        WebView webView,
        String token,
        String expectedSyncedText,
        long timeoutMs
    ) throws Exception {
        FolioleCompanionCaptureAnnotationScenario.assertToken(token);
        verifyContent(instrumentation, webView, expectedSyncedText, timeoutMs);
        reachCaptureSurface(instrumentation, webView, timeoutMs);
        FolioleCompanionCaptureAnnotationScenario.perform(
            instrumentation, webView, "companion-capture-open", "click", ""
        );
        FolioleCompanionCaptureAnnotationScenario.waitForTestId(
            instrumentation, webView, "companion-capture-text", timeoutMs
        );
        FolioleCompanionCaptureAnnotationScenario.perform(
            instrumentation, webView, "companion-capture-text", "input", content(token)
        );
        FolioleCompanionCaptureAnnotationScenario.waitFor(
            instrumentation, webView,
            "document.querySelector('[data-testid=\"companion-capture-save\"]')" +
                "&&!document.querySelector('[data-testid=\"companion-capture-save\"]')" +
                ".disabled",
            timeoutMs, "enabled ordinary journey Save"
        );
        FolioleCompanionCaptureAnnotationScenario.perform(
            instrumentation, webView, "companion-capture-save", "click", ""
        );
        FolioleCompanionCaptureAnnotationScenario.waitFor(
            instrumentation, webView,
            "document.querySelector('[data-testid=\"companion-capture-text\"]')===null",
            timeoutMs, "ordinary journey Capture save"
        );
        verifyContent(instrumentation, webView, token, timeoutMs);
        return new JSONObject()
            .put("captureCreated", true)
            .put("ok", true)
            .put("syncedContentVisible", true)
            .put("targetTestId", SCENARIO_ID)
            .put("token", token)
            .put("visibleBeforeRelaunch", true);
    }

    static void verifyAfterRelaunch(
        Instrumentation instrumentation,
        WebView webView,
        String token,
        String expectedSyncedText,
        long timeoutMs
    ) throws Exception {
        verifyContent(instrumentation, webView, expectedSyncedText, timeoutMs);
        verifyContent(instrumentation, webView, token, timeoutMs);
    }

    private static void verifyContent(
        Instrumentation instrumentation,
        WebView webView,
        String text,
        long timeoutMs
    ) throws Exception {
        reachRootDirectory(instrumentation, webView, timeoutMs);
        FolioleCompanionCaptureAnnotationScenario.perform(
            instrumentation, webView, INBOX_NODE, "click", ""
        );
        FolioleCompanionCaptureAnnotationScenario.waitFor(
            instrumentation, webView,
            "Array.prototype.some.call(document.querySelectorAll(" +
                "'button[data-testid^=\"companion-directory-node-\"]'),function(node){return " +
                "(node.innerText||'').includes(" + JSONObject.quote(text) + ");})",
            timeoutMs, "ordinary journey content"
        );
    }

    private static void reachCaptureSurface(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        while (!hasTestId(instrumentation, webView, "companion-capture-open")) {
            String target = availableEntry(instrumentation, webView);
            if (target != null) {
                FolioleCompanionCaptureAnnotationScenario.perform(
                    instrumentation, webView, target, "click", ""
                );
            } else {
                Thread.sleep(100);
            }
            if (System.nanoTime() >= deadline) {
                throw new IllegalStateException("Timed out reaching the ordinary Capture surface");
            }
        }
    }

    private static void reachRootDirectory(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        while (!hasTestId(instrumentation, webView, INBOX_NODE)) {
            String target = availableEntry(instrumentation, webView);
            if (target != null) {
                FolioleCompanionCaptureAnnotationScenario.perform(
                    instrumentation, webView, target, "click", ""
                );
            } else {
                Thread.sleep(100);
            }
            if (System.nanoTime() >= deadline) {
                throw new IllegalStateException("Timed out reaching the ordinary Browse directory");
            }
        }
    }

    private static String availableEntry(
        Instrumentation instrumentation,
        WebView webView
    ) throws Exception {
        for (String testId : BROWSE_ENTRIES) {
            if (hasTestId(instrumentation, webView, testId)) return testId;
        }
        return null;
    }

    private static boolean hasTestId(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        return FolioleCompanionWebViewSemanticAdapter.tryEvaluateBoolean(
            instrumentation, webView,
            "(function(){return JSON.stringify({ok:document.querySelector('[data-testid=\"" +
                testId + "\"]')!==null});})()"
        );
    }

    private static String content(String token) {
        return "A5 ordinary journey " + token;
    }
}
