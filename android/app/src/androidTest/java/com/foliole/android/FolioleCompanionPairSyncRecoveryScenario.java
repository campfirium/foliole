package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionPairSyncRecoveryScenario {
    private static final String CONNECTED_TARGET = "companion-sync-now";

    private FolioleCompanionPairSyncRecoveryScenario() {}
    static JSONObject run(
        Instrumentation instrumentation, WebView webView,
        boolean forceRePair, boolean credentialsOnly, String expectedEndpointUrl, long timeoutMs
    ) throws Exception {
        return runExistingScenario(
            instrumentation, webView, forceRePair, credentialsOnly, expectedEndpointUrl, timeoutMs
        );
    }

    private static JSONObject runExistingScenario(
        Instrumentation instrumentation, WebView webView,
        boolean forceRePair, boolean credentialsOnly, String expectedEndpointUrl, long timeoutMs
    ) throws Exception {
        if (!credentialsOnly) {
            throw new IllegalArgumentException("Pairing instrumentation only supports credential evidence.");
        }
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "settings-tab");
        FolioleCompanionSettingsNavigation.open(instrumentation, webView);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-settings");
        FolioleCompanionSemanticActions.clickVisible(
            instrumentation, webView, "companion-settings-sync", deadline
        );
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-entry");
        String entry = FolioleCompanionSemanticActions.waitForAnyVisible(
            instrumentation, webView, deadline,
            "companion-sync-now", "companion-sync-discover", "companion-sync-repair"
        );
        boolean existingPairing = CONNECTED_TARGET.equals(entry);
        JSONObject observer = FolioleCompanionWebViewSemanticAdapter.installPairSyncObserver(
            instrumentation, webView, existingPairing && !forceRePair
        );
        if (!observer.optBoolean("ok")) {
            throw new IllegalStateException("Pair sync observer is unavailable.");
        }
        if (existingPairing && forceRePair) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "existing-pair-disconnect");
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-connection", deadline
            );
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-disconnect", deadline
            );
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-discover", deadline
            );
            existingPairing = false;
        } else if (existingPairing) {
            throw new IllegalStateException("Existing pairing must use its owning product contract.");
        }
        if ("companion-sync-repair".equals(entry)) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-repair-action");
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-repair", deadline
            );
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-repair-accepted");
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-discover", deadline
            );
        }
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "discovery-request");
        FolioleCompanionSemanticActions.clickVisible(
            instrumentation, webView, "companion-sync-discover", deadline
        );
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-target");
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-request");
        FolioleCompanionPairSyncTargetSelection.click(
            instrumentation, webView, expectedEndpointUrl, deadline
        );
        FolioleCompanionPairRequestEvidence.awaitSubmission(instrumentation, webView, deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-completion");
        JSONObject recoveryEvidence = FolioleCompanionPairSyncRecoveryEvidenceWaiter.await(
            instrumentation, webView, deadline
        );
        return buildReceipt(recoveryEvidence, "new");
    }

    private static JSONObject buildReceipt(JSONObject recoveryEvidence, String pairingPath) throws Exception {
        JSONObject receipt = new JSONObject();
        receipt.put("ok", true);
        receipt.put("targetTestId", "companion-pair-sync-recovery");
        receipt.put("paired", true);
        receipt.put("pairingPath", pairingPath);
        receipt.put("initialSyncRequested", false);
        receipt.put("completion", recoveryEvidence.getString("completion"));
        receipt.put("credentials", recoveryEvidence.getString("credentials"));
        receipt.put("initialSync", recoveryEvidence.getString("initialSync"));
        return receipt;
    }
}
