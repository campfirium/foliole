package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class FolioleMobileNodeLinkTest {
    @Test
    public void opensColdAndForegroundSystemUrlsAndRejectsInvalidTargets() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        String protectedBefore = FolioleMobileLinkFacts.protectedFingerprint(context);
        FolioleMobileLinkFacts facts = FolioleMobileLinkFacts.read(context);
        FolioleMobileLinkStateAudit stateAudit = new FolioleMobileLinkStateAudit(context);
        Activity activity = coldOpen(instrumentation, facts.link(facts.topics.get(0)));
        try {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            Bundle probe = new Bundle();
            probe.putString("foliole_url_input", facts.link(facts.topics.get(0)));
            instrumentation.sendStatus(0, probe);
            waitForTopic(instrumentation, webView, facts.topics.get(0), false);
            capture(instrumentation, context, "mobile-link-cold.png");
            warmOpen(context, facts.link(facts.topics.get(1)));
            waitForTopic(instrumentation, webView, facts.topics.get(1), false);
            capture(instrumentation, context, "mobile-link-foreground.png");
            assertRejected(instrumentation, context, webView,
                facts.link("t111-missing-topic"), facts.topics.get(1));
            assertRejected(instrumentation, context, webView,
                facts.link(facts.topics.get(0)) + "&command=delete", facts.topics.get(1));
            assertRejected(instrumentation, context, webView,
                facts.link(facts.topics.get(0)).replace(facts.groupId, "t111-other-group"), facts.topics.get(1));
            warmOpen(context, facts.link(facts.topics.get(0)));
            waitForTopic(instrumentation, webView, facts.topics.get(0), false);
            assertEquals("Navigation must preserve content and group facts", protectedBefore,
                FolioleMobileLinkFacts.protectedFingerprint(context));
            Bundle evidence = new Bundle();
            evidence.putString("foliole_mobile_link", new JSONObject().put("cold", true)
                .put("foreground", true).put("missingRejected", true).put("invalidRejected", true)
                .put("wrongGroupRejected", true).put("reopen", true)
                .put("stateChanges", stateAudit.verify(context, facts.topics))
                .put("protectedFingerprint", protectedBefore).put("protectedDataPreserved", true).toString());
            instrumentation.sendStatus(0, evidence);
        } catch (Exception | AssertionError error) {
            capture(instrumentation, context, "mobile-link-failure.png");
            throw error;
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static Intent intent(Context context, String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        assertNotNull("System must resolve the registered URL", intent.resolveActivity(context.getPackageManager()));
        return intent;
    }

    private static Activity coldOpen(Instrumentation instrumentation, String url) {
        Context context = instrumentation.getTargetContext();
        Intent intent = intent(context, url);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(MainActivity.class.getName(), null, false);
        context.startActivity(intent);
        Activity activity = instrumentation.waitForMonitorWithTimeout(monitor, 30_000);
        instrumentation.removeMonitor(monitor);
        assertNotNull("Cold URL must launch the Activity", activity);
        return activity;
    }

    private static void warmOpen(Context context, String url) {
        context.startActivity(intent(context, url));
    }

    private static void assertRejected(Instrumentation instrumentation, Context context,
        WebView webView, String url, String currentTopic) throws Exception {
        warmOpen(context, url);
        waitForTopic(instrumentation, webView, currentTopic, true);
        capture(instrumentation, context, "mobile-link-rejected.png");
        JSONObject dismissed = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, "companion-link-dismiss", "click", "");
        assertTrue(dismissed.toString(), dismissed.optBoolean("ok"));
        waitForTopic(instrumentation, webView, currentTopic, false);
    }

    private static void waitForTopic(Instrumentation instrumentation, WebView webView,
        String topic, boolean rejected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
        JSONObject observed = new JSONObject();
        while (System.nanoTime() < deadline) {
            observed = FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView,
                "JSON.stringify({topic:document.querySelector('[data-companion-readable-document]')" +
                "?.getAttribute('data-node-id')||'',rejected:!!document.querySelector('[data-mobile-link-error]')," +
                "reason:document.querySelector('[data-mobile-link-error]')?.getAttribute('data-mobile-link-error')||''," +
                "readyState:document.readyState,bodyReady:!!document.body," +
                "surface:(document.body?.innerText||'').slice(0,1000)})");
            if (topic.equals(observed.optString("topic")) && rejected == observed.optBoolean("rejected")) return;
            Thread.sleep(100);
        }
        assertEquals(observed.toString(), topic, observed.optString("topic"));
        assertEquals(observed.toString(), rejected, observed.optBoolean("rejected"));
    }

    private static void capture(Instrumentation instrumentation, Context context, String name) throws Exception {
        Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        try (FileOutputStream out = new FileOutputStream(new File(context.getFilesDir(), name))) {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out));
        } finally { bitmap.recycle(); }
    }
}
