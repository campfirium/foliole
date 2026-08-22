package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionPairSyncRecoveryScenario {
    private static final String CONNECTED_TARGET = "companion-sync-now";

    private FolioleCompanionPairSyncRecoveryScenario() {}
    static JSONObject run(
        Instrumentation instrumentation, WebView webView,
        boolean forceRePair, boolean credentialsOnly, String expectedEndpointUrl, long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "settings-tab");
        FolioleCompanionSettingsNavigation.open(instrumentation, webView);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-settings");
        clickVisible(instrumentation, webView, "companion-settings-sync", deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "sync-entry");
        String entry = waitForAnyVisible(
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
            clickVisible(instrumentation, webView, "companion-sync-connection", deadline);
            clickVisible(instrumentation, webView, "companion-sync-disconnect", deadline);
            waitForUniqueVisible(instrumentation, webView, "companion-sync-discover", deadline);
            existingPairing = false;
        } else if (existingPairing) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "existing-pair-push");
            clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline);
            FolioleCompanionExistingPairSyncEvidence.await(
                instrumentation, webView, deadline, CONNECTED_TARGET
            );
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "existing-pair-ack-pull");
            clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline);
            return buildReceipt(FolioleCompanionExistingPairSyncEvidence.await(
                instrumentation, webView, deadline, CONNECTED_TARGET
            ), "existing");
        }
        if ("companion-sync-repair".equals(entry)) {
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-repair-action");
            clickVisible(instrumentation, webView, "companion-sync-repair", deadline);
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-repair-accepted");
            waitForUniqueVisible(instrumentation, webView, "companion-sync-discover", deadline);
        }
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "discovery-request");
        clickVisible(instrumentation, webView, "companion-sync-discover", deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-target");
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-request");
        FolioleCompanionPairSyncTargetSelection.click(
            instrumentation, webView, expectedEndpointUrl, deadline
        );
        FolioleCompanionPairRequestEvidence.awaitSubmission(instrumentation, webView, deadline);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "pair-completion");
        JSONObject recoveryEvidence = FolioleCompanionPairSyncRecoveryEvidenceWaiter.await(
            instrumentation, webView, deadline, credentialsOnly
        );
        return buildReceipt(recoveryEvidence, "new");
    }

    private static JSONObject buildReceipt(JSONObject recoveryEvidence, String pairingPath) throws Exception {
        JSONObject receipt = new JSONObject();
        receipt.put("ok", true);
        receipt.put("targetTestId", "companion-pair-sync-recovery");
        receipt.put("paired", true);
        receipt.put("pairingPath", pairingPath);
        receipt.put("initialSyncRequested", true);
        receipt.put("completion", recoveryEvidence.getString("completion"));
        receipt.put("credentials", recoveryEvidence.getString("credentials"));
        receipt.put("initialSync", recoveryEvidence.getString("initialSync"));
        return receipt;
    }

    static void clickVisible(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long deadline
    ) throws Exception {
        waitForUniqueVisible(instrumentation, webView, testId, deadline);
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, testId, "click", ""
        );
        if (!receipt.optBoolean("ok")) {
            throw new IllegalStateException("Semantic action failed: " + receipt);
        }
    }

    static void waitForUniqueVisible(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long deadline
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONArray elements = FolioleCompanionWebViewSemanticAdapter
                .snapshot(instrumentation, webView).getJSONArray("elements");
            int visible = 0;
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) {
                    visible += 1;
                }
            }
            if (visible == 1) return;
            if (visible > 1) throw new IllegalStateException("Pairing target is not unique: " + testId);
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for semantic target: " + testId);
    }

    static String waitForAnyVisible(
        Instrumentation instrumentation,
        WebView webView,
        long deadline,
        String... targets
    ) throws Exception {
        while (System.nanoTime() < deadline) {
            JSONArray elements = FolioleCompanionWebViewSemanticAdapter
                .snapshot(instrumentation, webView).getJSONArray("elements");
            for (int index = 0; index < elements.length(); index += 1) {
                JSONObject element = elements.getJSONObject(index);
                if (element.optBoolean("visible")) {
                    String testId = element.optString("testId");
                    for (String target : targets) if (target.equals(testId)) return testId;
                }
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for pairing or sync entry.");
    }

}
