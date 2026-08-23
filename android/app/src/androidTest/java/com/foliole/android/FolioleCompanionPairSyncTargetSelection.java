package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

final class FolioleCompanionPairSyncTargetSelection {
    private FolioleCompanionPairSyncTargetSelection() {}

    static void click(
        Instrumentation instrumentation, WebView webView, String expectedEndpointUrl, long deadline
    ) throws Exception {
        if (expectedEndpointUrl.isEmpty()) {
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-pair", deadline
            );
            return;
        }
        FolioleCompanionWebViewSemanticAdapter.clickUniqueVisibleMatchingAttribute(
            instrumentation, webView, "companion-sync-pair", "data-sync-endpoint",
            expectedEndpointUrl, deadline
        );
    }
}
