package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

final class FolioleCompanionCaptureNavigation {
    private static final String BROWSE_READY = "companion-capture-open";
    private static final String INBOX_NODE = "companion-directory-node-special-inbox";
    private static final String TOP_BAR_LEFT_ACTION = "companion-top-bar-left-action";

    private FolioleCompanionCaptureNavigation() {}

    static void enterBrowseSurface(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        if (!hasTestId(instrumentation, webView, BROWSE_READY)) {
            FolioleCompanionCaptureAnnotationScenario.waitForTestId(
                instrumentation, webView, TOP_BAR_LEFT_ACTION, timeoutMs
            );
            FolioleCompanionCaptureAnnotationScenario.perform(
                instrumentation, webView, TOP_BAR_LEFT_ACTION, "click", ""
            );
        }
        FolioleCompanionCaptureAnnotationScenario.waitForTestId(
            instrumentation, webView, BROWSE_READY, timeoutMs
        );
    }

    static void openDirectorySurface(
        Instrumentation instrumentation,
        WebView webView,
        long timeoutMs
    ) throws Exception {
        enterBrowseSurface(instrumentation, webView, timeoutMs);
        String directoryState = waitForEitherTestId(
            instrumentation, webView, INBOX_NODE, TOP_BAR_LEFT_ACTION, timeoutMs
        );
        if (TOP_BAR_LEFT_ACTION.equals(directoryState)) {
            FolioleCompanionCaptureAnnotationScenario.perform(
                instrumentation, webView, TOP_BAR_LEFT_ACTION, "click", ""
            );
        }
        FolioleCompanionCaptureAnnotationScenario.waitForTestId(
            instrumentation, webView, INBOX_NODE, timeoutMs
        );
    }

    private static String waitForEitherTestId(
        Instrumentation instrumentation,
        WebView webView,
        String first,
        String second,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        while (System.nanoTime() < deadline) {
            if (hasTestId(instrumentation, webView, first)) return first;
            if (hasTestId(instrumentation, webView, second)) return second;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for capture directory state");
    }

    private static boolean hasTestId(
        Instrumentation instrumentation,
        WebView webView,
        String testId
    ) throws Exception {
        return FolioleCompanionCaptureAnnotationScenario.evaluate(instrumentation, webView,
            "(function(){return JSON.stringify({ok:document.querySelector('[data-testid=\"" +
                testId + "\"]')!==null});})()").optBoolean("ok");
    }
}
