package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

final class FolioleCompanionCaptureNavigation {
    private static final String BROWSE_READY = "companion-capture-open";
    private static final String BROWSE_TAB = "companion-tab-browse";
    private static final String INBOX_NODE = "companion-directory-node-special-inbox";
    private static final String READING_EXIT = "companion-reading-exit";
    private static final String TOP_BAR_BACK = "companion-top-bar-back";
    private static final String TOP_BAR_LEFT_ACTION = "companion-top-bar-left-action";

    private FolioleCompanionCaptureNavigation() {}

    static void enterBrowseSurface(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        if (!hasTestId(instrumentation, webView, BROWSE_READY)) {
            String entry = waitForBrowseEntry(instrumentation, webView, timeoutMs);
            JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
                instrumentation, webView, entry, "click", ""
            );
            if (!receipt.optBoolean("ok") && !"target_missing".equals(receipt.optString("code"))) {
                throw new IllegalStateException("Browse navigation failed: " + receipt);
            }
        }
        FolioleCompanionCaptureAnnotationScenario.waitForTestId(
            instrumentation, webView, BROWSE_READY, timeoutMs
        );
    }

    private static String waitForBrowseEntry(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        while (System.nanoTime() < deadline) {
            if (hasTestId(instrumentation, webView, BROWSE_TAB)) return BROWSE_TAB;
            if (hasTestId(instrumentation, webView, TOP_BAR_LEFT_ACTION)) return TOP_BAR_LEFT_ACTION;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for Browse navigation entry");
    }

    static void openDirectorySurface(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        enterBrowseSurface(instrumentation, webView, timeoutMs);
        String directoryState = waitForDirectoryState(instrumentation, webView, timeoutMs, true);
        if (READING_EXIT.equals(directoryState)) {
            FolioleCompanionCaptureAnnotationScenario.perform(
                instrumentation, webView, READING_EXIT, "click", ""
            );
            directoryState = waitForDirectoryState(instrumentation, webView, timeoutMs, false);
        }
        if (TOP_BAR_LEFT_ACTION.equals(directoryState) || TOP_BAR_BACK.equals(directoryState)) {
            FolioleCompanionCaptureAnnotationScenario.perform(
                instrumentation, webView, directoryState, "click", ""
            );
        }
        FolioleCompanionCaptureAnnotationScenario.waitForTestId(
            instrumentation, webView, INBOX_NODE, timeoutMs
        );
    }

    static void waitForAnnotationPersistence(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs,
        String kind
    ) throws Exception {
        FolioleCompanionCaptureAnnotationScenario.waitFor(instrumentation, webView,
            "document.querySelector('[data-companion-selection-toolbar=\"true\"]')===null",
            timeoutMs, kind + " annotation persistence");
    }

    private static String waitForDirectoryState(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs,
        boolean includeReadingExit
    ) throws Exception {
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        while (System.nanoTime() < deadline) {
            if (includeReadingExit && hasTestId(instrumentation, webView, READING_EXIT)) return READING_EXIT;
            if (hasTestId(instrumentation, webView, INBOX_NODE)) return INBOX_NODE;
            if (hasTestId(instrumentation, webView, TOP_BAR_LEFT_ACTION)) return TOP_BAR_LEFT_ACTION;
            if (hasTestId(instrumentation, webView, TOP_BAR_BACK)) return TOP_BAR_BACK;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for capture directory state");
    }

    private static boolean hasTestId(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        return FolioleCompanionWebViewSemanticAdapter.tryEvaluateBoolean(instrumentation, webView,
            "(function(){return JSON.stringify({ok:document.querySelector('[data-testid=\"" +
                testId + "\"]')!==null});})()");
    }
}
