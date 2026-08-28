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
public class FolioleAcceptanceConflictForkTest {
    @Test
    public void forksConflictThroughProduct() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        String token = InstrumentationRegistry.getArguments().getString("conflictToken", "");
        Activity activity = start(instrumentation);
        try {
            waitForFocus(activity, 30_000);
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            JSONObject receipt = FolioleAcceptanceConflictScenario.forkExistingTopic(
                instrumentation, webView, token, 60_000
            );
            Bundle evidence = new Bundle();
            evidence.putString("folioleActionReceipt", receipt.toString());
            evidence.putString("folioleAfterSemantic",
                FolioleCompanionWebViewSemanticAdapter.snapshot(instrumentation, webView).toString());
            instrumentation.sendStatus(2, evidence);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
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
