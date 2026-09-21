package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleLibraryWorkspaceCapacityTest {
    private static final String APP_ID = "com.foliole.android.acceptance";
    private static final long DEADLINE_MS = 180_000;

    @Test
    public void measuresNormalCompanionWorkspaceAtOneThousand() throws Exception {
        recordStage(1000, false);
    }

    @Test
    public void measuresNormalCompanionWorkspaceAtTenThousand() throws Exception {
        recordStage(10000, true);
    }

    private void recordStage(int target, boolean complete) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals(APP_ID, context.getPackageName());
        File partial = new File(context.getFilesDir(), "t219-library-workspace-capacity-1000.json");
        JSONObject stage = runStage(instrumentation, target);
        if (stage == null) {
            assertTrue("Missing retained 1k workspace result", partial.isFile());
            return;
        }
        if (!complete) {
            writeJson(partial, stage);
            return;
        }
        assertTrue("Missing 1k workspace result", partial.isFile());
        JSONArray results = new JSONArray().put(new JSONObject(
            new String(java.nio.file.Files.readAllBytes(partial.toPath()), StandardCharsets.UTF_8)
        )).put(stage);
        JSONObject result = new JSONObject().put("status", "passed").put("platform", "android")
            .put("appId", APP_ID).put("scenario", "library-capacity-workspace").put("results", results)
            .put("memory", JSONObject.NULL)
            .put("memoryLimitation", "Android host/WebView memory is sampled by the fixed Mac owner, not this UI test");
        writeJson(new File(context.getFilesDir(), "t219-library-workspace-capacity.json"), result);
    }

    private void writeJson(File file, JSONObject value) throws Exception {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(value.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private JSONObject runStage(Instrumentation instrumentation, int target) throws Exception {
        Activity activity = launch(instrumentation);
        WebView webView = activity.findViewById(R.id.webview);
        assertNotNull(webView);
        String currentStage = waitForWorkspaceStage(instrumentation, webView);
        if (target == 1000 && "10000".equals(currentStage)) {
            activity.finish();
            instrumentation.waitForIdleSync();
            return null;
        }
        String expectedPreviousStage = target == 1000 ? "0" : "1000";
        if (!String.valueOf(target).equals(currentStage)) {
            assertEquals(expectedPreviousStage, currentStage);
            clickExact(instrumentation, webView, "t219-prepare-workspace");
            waitForStage(instrumentation, webView, String.valueOf(target));
        }
        long startupStarted = SystemClock.elapsedRealtime();
        clickExact(instrumentation, webView, "t219-open-workspace");
        String startupTarget = waitForStartupTarget(instrumentation, webView);
        long startupMs = SystemClock.elapsedRealtime() - startupStarted;
        exitStartupSurface(instrumentation, webView, startupTarget);
        long readStarted = SystemClock.elapsedRealtime();
        clickExact(instrumentation, webView, "companion-tab-shortcut");
        clickExact(instrumentation, webView, "companion-directory-node-node-0");
        clickExact(instrumentation, webView, "companion-directory-node-node-1");
        waitForTestId(instrumentation, webView, "companion-article-document");
        long readMs = SystemClock.elapsedRealtime() - readStarted;
        String refreshToken = "T219 refreshed " + target;
        long refreshMs = editAndRefresh(instrumentation, webView, refreshToken);
        JSONObject semantics = verifySemantics(instrumentation, webView, target);
        activity.finish();
        instrumentation.waitForIdleSync();
        return new JSONObject().put("fixtureCount", target).put("startupMs", startupMs)
            .put("readMs", readMs).put("refreshMs", refreshMs).put("semantics", semantics);
    }

    private JSONObject verifySemantics(
        Instrumentation instrumentation, WebView webView, int target
    ) throws Exception {
        JSONObject readable = FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView,
            "(function(){var d=document.querySelector('[data-companion-readable-document=true]');" +
            "return JSON.stringify({ok:!!d,text:d?d.textContent.slice(0,80):''});})()");
        assertTrue(readable.toString(), readable.optBoolean("ok"));
        clickExact(instrumentation, webView, "companion-reading-exit");
        clickExact(instrumentation, webView, "companion-tab-search");
        JSONObject input = FolioleCompanionWebViewSemanticAdapter.perform(instrumentation, webView,
            "companion-search-input", "input", "Synthetic measurement node 1");
        assertTrue(input.toString(), input.optBoolean("ok"));
        JSONObject search = waitForScript(instrumentation, webView,
            "(function(){var s=document.querySelector('[data-search-status=ready]');" +
            "return JSON.stringify({ok:!!s&&s.textContent.indexOf('Topic 1')>=0});})()");
        clickExact(instrumentation, webView, "companion-tab-learn");
        JSONObject review = waitForScript(instrumentation, webView,
            "(function(){return JSON.stringify({ok:!!document.querySelector('[aria-label] [data-companion-article-document=true]')});})()");
        return new JSONObject().put("directory", true).put("readable", readable)
            .put("search", search.optBoolean("ok")).put("review", review.optBoolean("ok"))
            .put("expectedFixtureCount", target);
    }

    private long editAndRefresh(
        Instrumentation instrumentation, WebView webView, String token
    ) throws Exception {
        clickExact(instrumentation, webView, "companion-article-document");
        clickExact(instrumentation, webView, "companion-reading-edit");
        JSONObject input = waitForScript(instrumentation, webView,
            "(function(){var n=document.querySelector('[contenteditable=\"true\"]');" +
            "if(!n)return JSON.stringify({ok:false});n.focus();var s=window.getSelection();" +
            "s.selectAllChildren(n);s.collapseToEnd();return JSON.stringify({ok:" +
            "document.execCommand('insertText',false," + JSONObject.quote("\n\n" + token) + ")});})()");
        assertTrue(input.toString(), input.optBoolean("ok"));
        long started = SystemClock.elapsedRealtime();
        clickExact(instrumentation, webView, "companion-reading-edit-done");
        waitForTestId(instrumentation, webView, "companion-reading-edit");
        return SystemClock.elapsedRealtime() - started;
    }

    private Activity launch(Instrumentation instrumentation) {
        Intent intent = instrumentation.getTargetContext().getPackageManager().getLaunchIntentForPackage(APP_ID);
        assertNotNull(intent);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private void waitForStage(Instrumentation instrumentation, WebView webView, String stage) throws Exception {
        JSONObject value = FolioleCompanionWebViewSemanticAdapter.waitForAttribute(instrumentation, webView,
            "t219-workspace-status", "data-stage", stage, DEADLINE_MS, new JSONObject());
        assertEquals(value.toString(), stage, value.optString("value"));
    }

    private String waitForWorkspaceStage(Instrumentation instrumentation, WebView webView) throws Exception {
        JSONObject ready = FolioleCompanionWebViewSemanticAdapter.waitForAttribute(
            instrumentation, webView, "t219-workspace-status", "data-status", "ready", DEADLINE_MS,
            new JSONObject()
        );
        assertEquals(ready.toString(), "ready", ready.optString("value"));
        JSONObject value = FolioleCompanionWebViewSemanticAdapter.readAttribute(
            instrumentation, webView, "t219-workspace-status", "data-stage");
        assertTrue(value.toString(), value.optBoolean("found"));
        return value.optString("value");
    }

    private void waitForTestId(Instrumentation instrumentation, WebView webView, String testId) throws Exception {
        JSONObject value = FolioleCompanionWebViewSemanticAdapter.waitForAttribute(
            instrumentation, webView, testId, "data-testid", testId, DEADLINE_MS, new JSONObject());
        assertEquals(value.toString(), testId, value.optString("value"));
    }

    private void clickExact(Instrumentation instrumentation, WebView webView, String testId) throws Exception {
        JSONObject result = FolioleCompanionWebViewSemanticAdapter.clickUniqueVisibleMatchingAttribute(
            instrumentation, webView, testId, "data-testid", testId, deadline());
        assertTrue(result.toString(), result.optBoolean("ok"));
    }

    private String waitForStartupTarget(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = deadline();
        while (System.nanoTime() < deadline) {
            for (String testId : new String[] {"companion-top-bar-left-action", "companion-bottom-tab-bar"}) {
                JSONObject value = FolioleCompanionWebViewSemanticAdapter.evaluateJson(
                    instrumentation, webView,
                    "(function(){var nodes=Array.prototype.slice.call(document.querySelectorAll(" +
                    JSONObject.quote("[data-testid=\"" + testId + "\"]") + "));" +
                    "return JSON.stringify({ok:nodes.some(function(node){var r=node.getBoundingClientRect();" +
                    "return !!(r.width&&r.height);})});})()"
                );
                if (value.optBoolean("ok")) return testId;
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for normal Companion startup.");
    }

    private void exitStartupSurface(
        Instrumentation instrumentation, WebView webView, String startupTarget
    ) throws Exception {
        if ("companion-top-bar-left-action".equals(startupTarget)) {
            clickExact(instrumentation, webView, startupTarget);
        }
        waitForTestId(instrumentation, webView, "companion-bottom-tab-bar");
    }

    private JSONObject waitForScript(Instrumentation instrumentation, WebView webView, String script) throws Exception {
        long deadline = deadline();
        while (System.nanoTime() < deadline) {
            JSONObject result = FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView, script);
            if (result.optBoolean("ok")) return result;
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for normal Companion semantics.");
    }

    private long deadline() {
        return System.nanoTime() + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(DEADLINE_MS);
    }
}
