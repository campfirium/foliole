package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class FolioleCompanionCaptureAnnotationScenario {
    private static final String SCENARIO_ID = "companion-capture-annotation-persistence";
    private static final String CLOZE_TEXT = "Cloze target alpha";
    private static final String NOTE_TEXT = "Note target beta";

    private FolioleCompanionCaptureAnnotationScenario() {}

    static JSONObject create(
        Instrumentation instrumentation,
        WebView webView,
        String token,
        long timeoutMs
    ) throws Exception {
        assertToken(token);
        FolioleCompanionCaptureNavigation.enterBrowseSurface(instrumentation, webView, timeoutMs);
        perform(instrumentation, webView, "companion-capture-open", "click", "");
        waitForTestId(instrumentation, webView, "companion-capture-text", timeoutMs);
        perform(instrumentation, webView, "companion-capture-text", "input", captureText(token));
        waitForEnabledTestId(instrumentation, webView, "companion-capture-save", timeoutMs);
        perform(instrumentation, webView, "companion-capture-save", "click", "");
        navigateToCapturedTopic(instrumentation, webView, token, timeoutMs);
        waitForText(instrumentation, webView, CLOZE_TEXT, timeoutMs);
        createNote(instrumentation, webView, token, timeoutMs);
        createCloze(instrumentation, webView, token, timeoutMs);
        JSONObject receipt = new JSONObject();
        receipt.put("action", "click");
        receipt.put("captureCreated", true);
        receipt.put("clozeCreated", true);
        receipt.put("noteCreated", true);
        receipt.put("ok", true);
        receipt.put("targetTestId", SCENARIO_ID);
        receipt.put("token", token);
        return receipt;
    }

    static void verifyHydrated(
        Instrumentation instrumentation,
        WebView webView,
        String token,
        long timeoutMs
    ) throws Exception {
        navigateToCapturedTopic(instrumentation, webView, token, timeoutMs);
        waitForButtonText(instrumentation, webView, token, timeoutMs);
        waitForButtonText(instrumentation, webView, NOTE_TEXT, timeoutMs);
        waitForButtonText(instrumentation, webView, CLOZE_TEXT, timeoutMs);
    }

    private static void createNote(
        Instrumentation instrumentation,
        WebView webView,
        String token,
        long timeoutMs
    ) throws Exception {
        selectText(instrumentation, webView, NOTE_TEXT, timeoutMs);
        perform(instrumentation, webView, "companion-selection-note", "click", "");
        waitForTestId(instrumentation, webView, "companion-selection-note-text", timeoutMs);
        perform(instrumentation, webView, "companion-selection-note-text", "input", "A5 note " + token);
        perform(instrumentation, webView, "companion-selection-note-save", "click", "");
        waitForButtonText(instrumentation, webView, NOTE_TEXT, timeoutMs);
    }

    private static void createCloze(
        Instrumentation instrumentation,
        WebView webView,
        String token,
        long timeoutMs
    ) throws Exception {
        navigateToCapturedTopic(instrumentation, webView, token, timeoutMs);
        waitForText(instrumentation, webView, CLOZE_TEXT, timeoutMs);
        selectText(instrumentation, webView, CLOZE_TEXT, timeoutMs);
        perform(instrumentation, webView, "companion-selection-cloze", "click", "");
        waitForButtonText(instrumentation, webView, CLOZE_TEXT, timeoutMs);
    }

    private static void navigateToCapturedTopic(
        Instrumentation instrumentation,
        WebView webView,
        String token,
        long timeoutMs
    ) throws Exception {
        FolioleCompanionCaptureNavigation.openDirectorySurface(instrumentation, webView, timeoutMs);
        perform(instrumentation, webView, "companion-directory-node-special-inbox", "click", "");
        waitForButtonText(instrumentation, webView, token, timeoutMs);
        evaluate(instrumentation, webView, clickButtonTextScript(token));
    }

    private static void selectText(
        Instrumentation instrumentation,
        WebView webView,
        String text,
        long timeoutMs
    ) throws Exception {
        JSONObject result = evaluate(instrumentation, webView, selectTextScript(text));
        if (!result.optBoolean("ok")) {
            throw new IllegalStateException("Could not select scenario text: " + result);
        }
        waitForTestId(instrumentation, webView, "companion-selection-note", timeoutMs);
    }

    static void perform(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        String action,
        String value
    ) throws Exception {
        JSONObject receipt = FolioleCompanionWebViewSemanticAdapter.perform(
            instrumentation, webView, testId, action, value
        );
        if (!receipt.optBoolean("ok")) throw new IllegalStateException("Scenario action failed: " + receipt);
    }

    static void waitForTestId(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long timeoutMs
    ) throws Exception {
        waitFor(instrumentation, webView,
            "document.querySelector('[data-testid=\"" + testId + "\"]')!==null", timeoutMs, "test id " + testId);
    }

    private static void waitForEnabledTestId(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        long timeoutMs
    ) throws Exception {
        String selector = "document.querySelector('[data-testid=\"" + testId + "\"]')";
        waitFor(instrumentation, webView, selector + "&&!" + selector + ".disabled", timeoutMs, "enabled test id " + testId);
    }

    private static void waitForButtonText(
        Instrumentation instrumentation,
        WebView webView,
        String text,
        long timeoutMs
    ) throws Exception {
        waitFor(instrumentation, webView, buttonTextExpression(text), timeoutMs, "button text " + text);
    }

    private static void waitForText(
        Instrumentation instrumentation,
        WebView webView,
        String text,
        long timeoutMs
    ) throws Exception {
        waitFor(instrumentation, webView,
            "document.body&&document.body.innerText.includes(" + JSONObject.quote(text) + ")", timeoutMs, "text " + text);
    }

    private static void waitFor(
        Instrumentation instrumentation,
        WebView webView,
        String expression,
        long timeoutMs,
        String label
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (System.nanoTime() < deadline) {
            if (evaluate(instrumentation, webView,
                "(function(){return JSON.stringify({ok:!!(" + expression + ")});})()").optBoolean("ok")) return;
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out waiting for " + label);
    }

    static JSONObject evaluate(
        Instrumentation instrumentation,
        WebView webView,
        String script
    ) throws Exception {
        return FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView, script);
    }

    private static String captureText(String token) {
        return "A5 capture " + token + "\n\n" + CLOZE_TEXT + ".\n\n" + NOTE_TEXT + ".";
    }

    private static String buttonTextExpression(String text) {
        return "Array.prototype.some.call(document.querySelectorAll('button'),function(node){" +
            "return (node.innerText||'').includes(" + JSONObject.quote(text) + ");})";
    }

    private static String clickButtonTextScript(String text) {
        return "(function(){var nodes=Array.prototype.slice.call(document.querySelectorAll('button'));" +
            "var node=nodes.find(function(item){return (item.innerText||'').includes(" + JSONObject.quote(text) + ");});" +
            "if(!node)return JSON.stringify({ok:false});node.click();return JSON.stringify({ok:true});})()";
    }

    private static String selectTextScript(String text) {
        String quoted = JSONObject.quote(text);
        return "(function(){var root=document.querySelector('.cm-content');if(!root)return JSON.stringify({ok:false,code:'editor_missing'});" +
            "var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);var node;while((node=walker.nextNode())){" +
            "var index=(node.nodeValue||'').indexOf(" + quoted + ");if(index<0)continue;var range=document.createRange();" +
            "range.setStart(node,index);range.setEnd(node,index+" + text.length() + ");var selection=window.getSelection();" +
            "selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange',{bubbles:true}));" +
            "var surface=root.closest('section');var rect=range.getBoundingClientRect();surface.dispatchEvent(new PointerEvent('pointerup'," +
            "{bubbles:true,clientX:rect.left,clientY:rect.top,pointerType:'touch'}));return JSON.stringify({ok:true});}" +
            "return JSON.stringify({ok:false,code:'text_missing'});})()";
    }

    private static void assertToken(String token) {
        if (!token.matches("[A-Za-z0-9._-]{8,80}")) {
            throw new IllegalArgumentException("capture annotation token is invalid");
        }
    }
}
