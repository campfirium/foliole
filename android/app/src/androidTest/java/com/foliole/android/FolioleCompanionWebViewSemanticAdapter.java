package com.foliole.android;

import android.app.Instrumentation;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class FolioleCompanionWebViewSemanticAdapter {
    private static final long EVALUATION_TIMEOUT_SECONDS = 2;
    private static final long SNAPSHOT_TIMEOUT_SECONDS = 30;

    private FolioleCompanionWebViewSemanticAdapter() {}

    static JSONObject snapshot(Instrumentation instrumentation, WebView webView) throws Exception {
        String script = "(function(){var nodes=Array.prototype.slice.call(" +
            "document.querySelectorAll('[data-testid]'),0,100);return JSON.stringify({" +
            "location:location.pathname,elements:nodes.map(function(node){var rect=node.getBoundingClientRect();" +
            "return {testId:node.getAttribute('data-testid'),tag:node.tagName.toLowerCase()," +
            "role:node.getAttribute('role')||'',ariaLabel:node.getAttribute('aria-label')||''," +
            "ariaCurrent:node.getAttribute('aria-current')||'',disabled:!!node.disabled," +
            "visible:!!(rect.width&&rect.height),bounds:{x:Math.round(rect.x),y:Math.round(rect.y)," +
            "width:Math.round(rect.width),height:Math.round(rect.height)}};})});})()";
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(SNAPSHOT_TIMEOUT_SECONDS);
        WebViewEvaluationTimeoutException lastTimeout = null;
        while (System.nanoTime() < deadline) {
            try {
                return evaluateJson(instrumentation, webView, script);
            } catch (WebViewEvaluationTimeoutException timeout) {
                lastTimeout = timeout;
            }
        }
        throw new IllegalStateException("Timed out waiting for a WebView semantic snapshot.", lastTimeout);
    }

    static JSONObject perform(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        String action,
        String value
    ) throws Exception {
        String quotedId = JSONObject.quote(testId);
        String quotedValue = JSONObject.quote(value == null ? "" : value);
        String script = "(function(){var node=document.querySelector('[data-testid=\"'+" + quotedId + "+'\"]');" +
            "if(!node)return JSON.stringify({ok:false,code:'target_missing'});" +
            "var rect=node.getBoundingClientRect();if(!rect.width||!rect.height)" +
            "return JSON.stringify({ok:false,code:'target_hidden'});" +
            "if(" + JSONObject.quote(action) + "==='click'){node.click();}" +
            "else if(" + JSONObject.quote(action) + "==='input'){if(!('value' in node))" +
            "return JSON.stringify({ok:false,code:'target_not_editable'});" +
            "var descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value');" +
            "if(!descriptor||typeof descriptor.set!=='function')" +
            "return JSON.stringify({ok:false,code:'target_not_editable'});node.focus();" +
            "descriptor.set.call(node," + quotedValue + ");" +
            "node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}" +
            "else{return JSON.stringify({ok:false,code:'action_unsupported'});}" +
            "return JSON.stringify({ok:true,action:" + JSONObject.quote(action) + ",targetTestId:" + quotedId + "," +
            "tag:node.tagName.toLowerCase(),role:node.getAttribute('role')||''," +
            "ariaLabel:node.getAttribute('aria-label')||''});})()";
        return evaluateJson(instrumentation, webView, script);
    }

    static JSONObject clickUniqueVisibleMatchingAttribute(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        String attribute,
        String expected,
        long deadline
    ) throws Exception {
        String quotedId = JSONObject.quote(testId);
        String quotedAttribute = JSONObject.quote(attribute);
        String quotedExpected = JSONObject.quote(expected);
        String script = "(function(){var nodes=Array.prototype.slice.call(" +
            "document.querySelectorAll('[data-testid=\"'+" + quotedId + "+'\"]'));" +
            "var matches=nodes.filter(function(node){var rect=node.getBoundingClientRect();" +
            "return !!(rect.width&&rect.height)&&node.getAttribute(" + quotedAttribute + ")===" +
            quotedExpected + ";});if(matches.length!==1)return JSON.stringify({ok:false," +
            "code:matches.length>1?'target_ambiguous':'target_missing'});matches[0].click();" +
            "return JSON.stringify({ok:true});})()";
        while (System.nanoTime() < deadline) {
            JSONObject receipt = evaluateJson(instrumentation, webView, script);
            if (receipt.optBoolean("ok")) return receipt;
            if ("target_ambiguous".equals(receipt.optString("code"))) {
                throw new IllegalStateException("Sync Group target is not unique: " + testId);
            }
            Thread.sleep(150);
        }
        throw new IllegalStateException("Timed out waiting for semantic target: " + testId);
    }

    static JSONObject waitForAttribute(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        String attribute,
        String expected,
        long timeoutMs,
        JSONObject receipt
    ) throws Exception {
        if ("__actionAccepted".equals(attribute)) {
            JSONObject accepted = new JSONObject();
            accepted.put("found", true);
            accepted.put("value", receipt.optBoolean("ok") ? "true" : "false");
            return accepted;
        }
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        JSONObject latest = new JSONObject();
        String script = "(function(){var node=document.querySelector('[data-testid=\"'+" +
            JSONObject.quote(testId) + "+'\"]');return JSON.stringify({found:!!node," +
            "value:node?(node.getAttribute(" + JSONObject.quote(attribute) + ")||''):''});})()";
        while (System.nanoTime() < deadline) {
            latest = evaluateJson(instrumentation, webView, script);
            if (latest.optBoolean("found") && expected.equals(latest.optString("value"))) return latest;
            Thread.sleep(100);
        }
        return latest;
    }

    static JSONObject readAttribute(
        Instrumentation instrumentation,
        WebView webView,
        String testId,
        String attribute
    ) throws Exception {
        String script = "(function(){var node=document.querySelector('[data-testid=\"'+" +
            JSONObject.quote(testId) + "+'\"]');return JSON.stringify({found:!!node," +
            "value:node?(node.getAttribute(" + JSONObject.quote(attribute) + ")||''):''});})()";
        return evaluateJson(instrumentation, webView, script);
    }

    static JSONObject evaluateJson(
        Instrumentation instrumentation,
        WebView webView,
        String script
    ) throws Exception {
        String raw = evaluateRaw(instrumentation, webView, script);
        return new JSONObject(new JSONArray("[" + raw + "]").getString(0));
    }

    static JSONObject tryEvaluateJson(
        Instrumentation instrumentation,
        WebView webView,
        String script
    ) throws Exception {
        try {
            return evaluateJson(instrumentation, webView, script);
        } catch (WebViewEvaluationTimeoutException timeout) {
            return null;
        }
    }

    static boolean tryEvaluateBoolean(
        Instrumentation instrumentation, WebView webView, String script
    ) throws Exception {
        JSONObject result = tryEvaluateJson(instrumentation, webView, script);
        return result != null && result.optBoolean("ok");
    }

    private static String evaluateRaw(
        Instrumentation instrumentation,
        WebView webView,
        String script
    ) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        boolean posted = webView.post(() -> webView.evaluateJavascript(script, value -> {
            result.set(value);
            latch.countDown();
        }));
        if (!posted || !latch.await(EVALUATION_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            throw new WebViewEvaluationTimeoutException();
        }
        return result.get();
    }

    private static final class WebViewEvaluationTimeoutException extends IllegalStateException {
        WebViewEvaluationTimeoutException() {
            super("Timed out while evaluating the WebView semantic action.");
        }
    }
}
