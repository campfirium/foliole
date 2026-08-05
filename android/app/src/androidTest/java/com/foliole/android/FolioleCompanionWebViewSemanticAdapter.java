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
        return evaluateJson(instrumentation, webView, script);
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

    static JSONObject pairingRequestState(
        Instrumentation instrumentation,
        WebView webView
    ) throws Exception {
        String script = "(function(){var pair=document.querySelector('[data-testid=\"companion-sync-pair\"]');" +
            "var error=document.querySelector('.text-error');var text=error?(error.textContent||'').toLowerCase():'';" +
            "var reason='';if(text.indexOf('pair_request_rate_limited')>=0)reason='request_rate_limited';" +
            "else if(text.indexOf('protocol_incompatible')>=0)reason='protocol_incompatible';" +
            "else if(text.indexOf('invalid_pair_request')>=0)reason='invalid_pair_request';" +
            "else if(text.indexOf('desktop http request failed')>=0)reason='desktop_http_failed';" +
            "else if(/crypto|subtle|ecdh|replaceall/.test(text))reason='pairing_crypto_failed';" +
            "else if(error)reason='request_ui_error';return JSON.stringify({" +
            "pairFound:!!pair,pairDisabled:!!(pair&&pair.disabled),errorReason:reason});})()";
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

    private static String evaluateRaw(
        Instrumentation instrumentation,
        WebView webView,
        String script
    ) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(script, value -> {
            result.set(value);
            latch.countDown();
        }));
        if (!latch.await(EVALUATION_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Timed out while evaluating the WebView semantic action.");
        }
        return result.get();
    }
}
