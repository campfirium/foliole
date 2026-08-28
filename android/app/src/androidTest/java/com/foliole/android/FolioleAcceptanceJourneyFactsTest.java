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

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.TimeUnit;
import java.util.Iterator;

@RunWith(AndroidJUnit4.class)
public class FolioleAcceptanceJourneyFactsTest {
    @Test
    public void observesJourneyFactsThroughProduct() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = start(instrumentation);
        try {
            waitForFocus(activity, 30_000);
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            FolioleCompanionCaptureNavigation.enterBrowseSurface(instrumentation, webView, 30_000);
            JSONObject receipt = waitForFacts(instrumentation, webView);
            Bundle evidence = new Bundle();
            evidence.putString("folioleActionReceipt", receipt.toString());
            evidence.putString("folioleAfterSemantic",
                FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView).toString());
            instrumentation.sendStatus(2, evidence);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static JSONObject waitForFacts(
        Instrumentation instrumentation, WebView webView
    ) throws Exception {
        JSONObject expected = new JSONObject(InstrumentationRegistry.getArguments()
            .getString("expectedJourneyCounts", ""));
        if (expected.length() == 0) {
            throw new IllegalStateException("acceptance_journey_counts_missing");
        }
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(2);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = visibleFacts(instrumentation, webView);
            if (satisfies(latest.getJSONObject("counts"), expected)) {
                return latest.put("journeyFactsObserved", true);
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for journey facts: " + latest);
    }

    private static JSONObject visibleFacts(
        Instrumentation instrumentation, WebView webView
    ) throws Exception {
        String script = "(function(){var prefix='Multi-device sync ';" +
            "var values=Array.prototype.slice.call(document.querySelectorAll('body *'))" +
            ".filter(function(node){var r=node.getBoundingClientRect();return r.width&&r.height;})" +
            ".map(function(node){return (node.textContent||'').trim();})" +
            ".filter(function(value){return value.indexOf(prefix)===0&&value.indexOf(' fact')>0;});" +
            "var unique=values.filter(function(value,index){return values.indexOf(value)===index;});" +
            "var counts={};unique.forEach(function(value){var origin=value.slice(prefix.length," +
            "prefix.length+1);counts[origin]=(counts[origin]||0)+1;});" +
            "return JSON.stringify({counts:counts,facts:unique});})()";
        return FolioleCompanionWebViewSemanticAdapter.evaluateJson(
            instrumentation, webView, script
        );
    }

    private static boolean satisfies(JSONObject actual, JSONObject expected) {
        Iterator<String> keys = expected.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (actual.optInt(key, 0) < expected.optInt(key, 0)) return false;
        }
        return true;
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
