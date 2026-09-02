package com.foliole.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.webkit.WebView;

import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncGroupJoinScenario {
    private static final String LOG_TAG = "FolioleA5Join";
    private static final long STAGE_TIMEOUT_SECONDS = 30;

    private FolioleCompanionSyncGroupJoinScenario() {}

    static JSONObject run(Instrumentation instrumentation) throws Exception {
        Activity activity = start(instrumentation);
        try {
            waitForFocus(activity, 30_000);
            Log.i(LOG_TAG, "stage=focused");
            WebView webView = activity.findViewById(R.id.webview);
            boolean joinOnly = Boolean.parseBoolean(
                InstrumentationRegistry.getArguments().getString("joinOnly", "false")
            );
            JSONObject prejoinFact = null;
            if (!joinOnly) {
                prejoinFact = FolioleCompanionSyncGroupMaintenanceScenario.createFact(
                    instrumentation, webView
                );
                Log.i(LOG_TAG, "stage=prejoin-fact-created");
            }
            FolioleCompanionSettingsNavigation.open(instrumentation, webView);
            Log.i(LOG_TAG, "stage=settings-open");
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-settings-sync", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=sync-open");
            String expectedEndpoint = expectedEndpoint(instrumentation);
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-sync-discover", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=discovery-requested");
            FolioleCompanionWebViewSemanticAdapter.clickUniqueVisibleMatchingAttribute(
                instrumentation, webView, "companion-sync-group-join", "data-sync-endpoint",
                expectedEndpoint, stageDeadline());
            Log.i(LOG_TAG, "stage=device-visible");
            Log.i(LOG_TAG, "stage=device-requested");
            String requestState = FolioleCompanionSemanticActions.waitForAnyVisible(
                instrumentation, webView, stageDeadline(),
                "companion-sync-awaiting-approval", "companion-sync-error"
            );
            if ("companion-sync-error".equals(requestState)) {
                JSONObject error = FolioleCompanionWebViewSemanticAdapter.readAttribute(
                    instrumentation, webView, requestState, "data-error-code"
                );
                throw new IllegalStateException(
                    "Sync Group Device request failed: " + error.optString("value", "unknown")
                );
            }
            Log.i(LOG_TAG, "stage=awaiting-approval");
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-now", stageDeadline()
            );
            Log.i(LOG_TAG, "stage=joined");
            instrumentation.runOnMainSync(activity::finish);
            activity = start(instrumentation);
            waitForFocus(activity, 30_000);
            webView = activity.findViewById(R.id.webview);
            FolioleCompanionSettingsNavigation.open(instrumentation, webView);
            FolioleCompanionSemanticActions.clickVisible(
                instrumentation, webView, "companion-settings-sync", stageDeadline()
            );
            FolioleCompanionSemanticActions.waitForUniqueVisible(
                instrumentation, webView, "companion-sync-now", stageDeadline()
            );
            JSONObject receipt = new JSONObject()
                .put("ok", true).put("targetTestId", "sync-group-device-join")
                .put("joined", true).put("restarted", true);
            if (prejoinFact != null) {
                receipt.put("prejoinFactText", prejoinFact.getString("factText"));
            }
            return receipt;
        } finally {
            Activity finalActivity = activity;
            instrumentation.runOnMainSync(finalActivity::finish);
        }
    }

    private static long stageDeadline() {
        return System.nanoTime() + TimeUnit.SECONDS.toNanos(STAGE_TIMEOUT_SECONDS);
    }

    private static String expectedEndpoint(Instrumentation instrumentation) throws Exception {
        String groupId = InstrumentationRegistry.getArguments().getString("expectedGroupId", "");
        String groupTag = InstrumentationRegistry.getArguments().getString("expectedGroupTag", "");
        String preferredEndpoint = InstrumentationRegistry.getArguments()
            .getString("expectedEndpoint", "");
        if (!groupId.matches("^group-[0-9a-f-]{36}$") || !groupTag.matches("^[0-9a-f]{32}$")) {
            throw new IllegalStateException("acceptance_group_identity_missing");
        }
        Context context = instrumentation.getTargetContext();
        if (!preferredEndpoint.isEmpty()) {
            assertEndpointIdentity(context, preferredEndpoint, groupId, groupTag);
            return preferredEndpoint;
        }
        List<String> matches = new ArrayList<>();
        int mismatches = 0;
        for (JSObject candidate : FolioleCompanionNsdDiscovery.discoverCandidates(context)) {
            String endpointKey = FolioleCompanionHostBridgeContractDefinitions
                .networkEndpointUrlCandidateKey(context);
            String endpoint = candidate.optString(endpointKey);
            JSObject response = FolioleCompanionDesktopHttpClient.request(context,
                endpoint + "/companion/discovery", "GET", new JSONObject(), null);
            String bodyKey = FolioleCompanionHostBridgeContractDefinitions.networkBodyResponseKey(context);
            JSONObject discovery = new JSONObject(response.getString(bodyKey));
            boolean idMatches = groupId.equals(discovery.optString("group_id"));
            boolean tagMatches = groupTag.equals(discovery.optString("group_tag"));
            if (idMatches && tagMatches) matches.add(endpoint);
            else if (idMatches || tagMatches) mismatches += 1;
        }
        if (mismatches > 0) {
            throw new IllegalStateException("acceptance_group_identity_not_unique");
        }
        if (matches.size() != 1) {
            throw new IllegalStateException("acceptance_group_identity_not_unique");
        }
        return matches.get(0);
    }

    private static void assertEndpointIdentity(
        Context context, String endpoint, String groupId, String groupTag
    ) throws Exception {
        JSObject response = FolioleCompanionDesktopHttpClient.request(
            context, endpoint + "/companion/discovery", "GET", new JSONObject(), null
        );
        String bodyKey = FolioleCompanionHostBridgeContractDefinitions
            .networkBodyResponseKey(context);
        JSONObject discovery = new JSONObject(response.getString(bodyKey));
        if (!groupId.equals(discovery.optString("group_id"))
            || !groupTag.equals(discovery.optString("group_tag"))) {
            throw new IllegalStateException("acceptance_group_endpoint_identity_mismatch");
        }
    }

    private static Activity start(Instrumentation instrumentation) {
        Context context = instrumentation.getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) throw new IllegalStateException("Main launch intent is missing.");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private static void waitForFocus(Activity activity, long timeoutMs) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            if (activity.hasWindowFocus()) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Foliole did not receive window focus.");
    }
}
