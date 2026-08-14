package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionWebViewAutomationTest {
    private static final String DEFAULT_TARGET = "companion-tab-settings";

    @Test
    public void performsBoundedSemanticAction() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle arguments = InstrumentationRegistry.getArguments();
        Activity activity = startMainActivity(instrumentation);
        try {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            String testId = arguments.getString("testId", DEFAULT_TARGET);
            String action = arguments.getString("action", "click");
            String expectedAttribute = arguments.getString("expectedAttribute", "aria-current");
            String expectedValue = arguments.getString("expectedValue", "page");
            long timeoutMs = boundedTimeout(arguments.getString("timeoutMs", "10000"));
            waitForWindowFocus(activity, timeoutMs);
            waitForTarget(instrumentation, webView, testId, timeoutMs);

            JSONObject before = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
                instrumentation, webView, testId, action, decodeValue(arguments.getString("valueBase64", ""))
            );
            assertTrue(receipt.toString(), receipt.optBoolean("ok"));
            JSONObject observed = FolioleCompanionWebViewSemanticAdapter.waitForAttribute(
                instrumentation, webView, testId, expectedAttribute, expectedValue, timeoutMs, receipt
            );
            assertEquals(observed.toString(), expectedValue, observed.optString("value"));
            sendEvidence(instrumentation, before,
                FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView), receipt);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    @Test
    public void performsBoundedSemanticSequence() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle arguments = InstrumentationRegistry.getArguments();
        Activity activity = startMainActivity(instrumentation);
        try {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            long timeoutMs = boundedTimeout(arguments.getString("timeoutMs", "10000"));
            waitForWindowFocus(activity, timeoutMs);
            JSONObject before = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            List<JSONObject> receipts = new ArrayList<>();
            for (String testId : parseTestIds(arguments.getString("testIds", ""))) {
                waitForTarget(instrumentation, webView, testId, timeoutMs);
                JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
                    instrumentation, webView, testId, "click", ""
                );
                assertTrue(receipt.toString(), receipt.optBoolean("ok"));
                receipts.add(receipt);
            }
            JSONObject sequenceReceipt = new JSONObject();
            sequenceReceipt.put("ok", true);
            sequenceReceipt.put("action", "sequence");
            sequenceReceipt.put("targetTestId", receipts.get(receipts.size() - 1).optString("targetTestId"));
            sequenceReceipt.put("steps", receipts);
            sendEvidence(instrumentation, before,
                FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView), sequenceReceipt);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    @Test
    public void persistsCaptureClozeAndNoteAfterRestart() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle arguments = InstrumentationRegistry.getArguments();
        long timeoutMs = boundedTimeout(arguments.getString("timeoutMs", "30000"));
        String token = arguments.getString("expectedValue", "");
        Activity activity = startMainActivity(instrumentation);
        try {
            waitForWindowFocus(activity, timeoutMs);
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            JSONObject before = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            JSONObject receipt = FolioleCompanionCaptureAnnotationScenario.create(
                instrumentation, webView, token, timeoutMs
            );
            instrumentation.runOnMainSync(activity::finish);
            activity = startMainActivity(instrumentation);
            waitForWindowFocus(activity, timeoutMs);
            webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            FolioleCompanionCaptureAnnotationScenario.verifyHydrated(
                instrumentation, webView, token, timeoutMs
            );
            receipt.put("hydratedAfterRestart", true);
            sendEvidence(instrumentation, before,
                FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView), receipt);
        } finally {
            Activity finalActivity = activity;
            instrumentation.runOnMainSync(finalActivity::finish);
        }
    }

    @Test
    public void recoversPairingAndInitialSync() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        boolean forceRePair = "re-pair".equals(
            InstrumentationRegistry.getArguments().getString("foliolePairSyncMode", "")
        );
        String expectedEndpointUrl = InstrumentationRegistry.getArguments().getString(
            "foliolePairSyncEndpoint", ""
        );
        Activity activity = startMainActivity(instrumentation);
        FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "activity-started");
        try {
            waitForWindowFocus(activity, 30_000);
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "window-focused");
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            FolioleCompanionPairSyncHostEvidence.stage(instrumentation, "webview-ready");
            JSONObject before = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            JSONObject receipt = FolioleCompanionPairSyncRecoveryScenario.run(
                instrumentation, webView, forceRePair, expectedEndpointUrl, 600_000
            );
            sendEvidence(instrumentation, before,
                FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView), receipt);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static Activity startMainActivity(Instrumentation instrumentation) {
        Context context = instrumentation.getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) throw new IllegalStateException("Main launch intent is missing.");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private static void waitForTarget(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long timeoutMs
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            JSONObject snapshot = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            for (int index = 0; index < snapshot.getJSONArray("elements").length(); index += 1) {
                JSONObject element = snapshot.getJSONArray("elements").getJSONObject(index);
                if (testId.equals(element.optString("testId")) && element.optBoolean("visible")) return;
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for semantic target: " + testId);
    }

    private static void waitForWindowFocus(Activity activity, long timeoutMs) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            if (activity.hasWindowFocus()) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Foliole did not receive window focus; a lock screen or system UI may be blocking it.");
    }

    private static long boundedTimeout(String raw) {
        long value = Long.parseLong(raw);
        if (value < 1_000 || value > 30_000) throw new IllegalArgumentException("timeoutMs is outside 1000..30000");
        return value;
    }

    private static String decodeValue(String encoded) {
        byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
        if (bytes.length > 4096) throw new IllegalArgumentException("input value exceeds 4096 bytes");
        return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static List<String> parseTestIds(String raw) {
        List<String> ids = new ArrayList<>();
        for (String item : raw.split(",")) {
            String trimmed = item.trim();
            if (!trimmed.isEmpty()) ids.add(trimmed);
        }
        if (ids.isEmpty()) throw new IllegalArgumentException("testIds is required for semantic sequence");
        return ids;
    }

    private static void sendEvidence(
        Instrumentation instrumentation,
        JSONObject before,
        JSONObject after,
        JSONObject receipt
    ) {
        Bundle evidence = new Bundle();
        evidence.putString("folioleBeforeSemantic", before.toString());
        evidence.putString("folioleAfterSemantic", after.toString());
        evidence.putString("folioleActionReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }
}
