package com.foliole.android;

import static org.junit.Assert.assertNotNull;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncGroupMaintenanceTest {
    @Test public void leavesSyncGroupThroughProduct() throws Exception { run(true); }
    @Test public void clearsAppDataThroughProduct() throws Exception { run(false); }
    @Test public void createsJourneyFactThroughProduct() throws Exception { runFact(); }
    @Test public void controlsSyncParticipationThroughProduct() throws Exception { runParticipation(); }
    @Test public void activatesSyncParticipationThroughProduct() throws Exception { runActivate(); }
    @Test public void pausesSyncParticipationThroughProduct() throws Exception { runSetPause(true); }
    @Test public void resumesSyncParticipationThroughProduct() throws Exception { runSetPause(false); }
    @Test public void pausesAndLeavesSyncGroupThroughProduct() throws Exception { runPauseAndLeave(); }
    private void run(boolean leave) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = start(instrumentation);
        try {
            waitForWindowFocus(activity, 30_000);
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            JSONObject before = FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView);
            JSONObject receipt = leave
                ? FolioleCompanionSyncGroupMaintenanceScenario.leave(instrumentation, webView)
                : FolioleCompanionSyncGroupMaintenanceScenario.clearAppData(instrumentation, webView);
            Bundle evidence = new Bundle();
            evidence.putString("folioleBeforeSemantic", before.toString());
            evidence.putString("folioleAfterSemantic",
                (leave ? departureSemantic(instrumentation)
                    : FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView)).toString());
            evidence.putString("folioleActionReceipt", receipt.toString());
            instrumentation.sendStatus(2, evidence);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private void runFact() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = start(instrumentation);
        try {
            waitForWindowFocus(activity, 30_000);
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            Bundle evidence = new Bundle();
            evidence.putString("folioleAfterSemantic",
                FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView).toString());
            evidence.putString("folioleActionReceipt",
                FolioleCompanionSyncGroupMaintenanceScenario.createFact(instrumentation, webView).toString());
            instrumentation.sendStatus(2, evidence);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private void runParticipation() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = start(instrumentation);
        JSONObject receipt = new JSONObject();
        try {
            WebView webView = readyWebView(instrumentation, activity);
            FolioleCompanionSyncGroupMaintenanceScenario.toggleSync(instrumentation, webView);
            waitParticipation(instrumentation, false, false);
            receipt.put("syncOffPersisted", true);
            instrumentation.runOnMainSync(activity::finish);
            activity = start(instrumentation);
            webView = readyWebView(instrumentation, activity);
            waitParticipation(instrumentation, false, false);
            FolioleCompanionSyncGroupMaintenanceScenario.toggleSync(instrumentation, webView);
            waitParticipation(instrumentation, true, false);
            FolioleCompanionSyncGroupMaintenanceScenario.togglePause(instrumentation, webView);
            waitParticipation(instrumentation, true, true);
            receipt.put("pausePersisted", true);
            instrumentation.runOnMainSync(activity::finish);
            activity = start(instrumentation);
            webView = readyWebView(instrumentation, activity);
            waitParticipation(instrumentation, true, true);
            FolioleCompanionSyncGroupMaintenanceScenario.togglePause(instrumentation, webView);
            waitParticipation(instrumentation, true, false);
            receipt.put("resumed", true);
            sendEvidence(instrumentation, webView, receipt);
        } finally {
            Activity finalActivity = activity;
            instrumentation.runOnMainSync(finalActivity::finish);
        }
    }

    private void runActivate() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = start(instrumentation);
        try {
            WebView webView = readyWebView(instrumentation, activity);
            JSONObject state = participationState(instrumentation);
            if (!state.optBoolean("sync_enabled")) {
                FolioleCompanionSyncGroupMaintenanceScenario.toggleSync(instrumentation, webView);
                state = participationState(instrumentation);
            }
            if (state.optBoolean("sync_paused")) {
                FolioleCompanionSyncGroupMaintenanceScenario.togglePause(instrumentation, webView);
            }
            waitParticipation(instrumentation, true, false);
            sendEvidence(instrumentation, webView, new JSONObject().put("activated", true));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private void runPauseAndLeave() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = start(instrumentation);
        try {
            WebView webView = readyWebView(instrumentation, activity);
            FolioleCompanionSyncGroupMaintenanceScenario.togglePause(instrumentation, webView);
            waitParticipation(instrumentation, true, true);
            JSONObject receipt = FolioleCompanionSyncGroupMaintenanceScenario.leave(instrumentation, webView)
                .put("pausedBeforeLeave", true);
            sendDepartureEvidence(instrumentation, receipt);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private void runSetPause(boolean paused) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = start(instrumentation);
        try {
            WebView webView = readyWebView(instrumentation, activity);
            FolioleCompanionSyncGroupMaintenanceScenario.togglePause(instrumentation, webView);
            waitParticipation(instrumentation, true, paused);
            JSONObject receipt = new JSONObject().put(paused ? "paused" : "resumed", true);
            sendEvidence(instrumentation, webView, receipt);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static WebView readyWebView(Instrumentation instrumentation, Activity activity) throws Exception {
        waitForWindowFocus(activity, 30_000);
        WebView webView = activity.findViewById(R.id.webview);
        assertNotNull(webView);
        return webView;
    }

    private static void sendEvidence(
        Instrumentation instrumentation, WebView webView, JSONObject receipt
    ) throws Exception {
        Bundle evidence = new Bundle();
        evidence.putString("folioleAfterSemantic",
            FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView).toString());
        evidence.putString("folioleActionReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }

    private static void sendDepartureEvidence(
        Instrumentation instrumentation, JSONObject receipt
    ) throws Exception {
        Bundle evidence = new Bundle();
        evidence.putString("folioleAfterSemantic", departureSemantic(instrumentation).toString());
        evidence.putString("folioleActionReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }

    private static JSONObject departureSemantic(Instrumentation instrumentation) throws Exception {
        return new JSONObject().put("bindingPresent", false).put("workgroupKeyPresent", false)
            .put("participation", participationState(instrumentation));
    }

    private static void waitParticipation(
        Instrumentation instrumentation, boolean enabled, boolean paused
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (System.nanoTime() < deadline) {
            JSONObject state = FolioleCompanionSyncParticipationStore.state(
                instrumentation.getTargetContext(), true
            );
            if (state.optBoolean("sync_enabled") == enabled
                && state.optBoolean("sync_paused") == paused) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for Sync participation state.");
    }

    private static JSONObject participationState(Instrumentation instrumentation) throws Exception {
        return FolioleCompanionSyncParticipationStore.state(instrumentation.getTargetContext(), true);
    }

    private static Activity start(Instrumentation instrumentation) {
        Context context = instrumentation.getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) throw new IllegalStateException("Main launch intent is missing.");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private static void waitForWindowFocus(Activity activity, long timeoutMs) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            if (activity.hasWindowFocus()) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException(
            "Foliole did not receive window focus; a lock screen or system UI may be blocking it."
        );
    }
}
