package com.foliole.android;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FolioleS220ResourceDiagnosticTest {
    private static final String BODY_MARKER = "Resource LAN body remains readable.";

    @Test public void capturesOfflineResourceBoundariesOnce() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("com.foliole.android.s220acceptance", context.getPackageName());
        Bundle args = InstrumentationRegistry.getArguments();
        JSONArray hashes = new JSONArray().put(requireHash(args, "availableHash"))
            .put(requireHash(args, "recoveringHash"));
        JSONObject receipt = new JSONObject().put("hashes", hashes);
        Activity activity = null;
        Throwable failure = null;
        try {
            receipt.put("networkOff", FolioleArticleImageTestNetwork.disconnect(context));
            activity = openNode(instrumentation, context, args);
            WebView view = activity.findViewById(R.id.webview);
            JSONObject document = waitForDocument(instrumentation, view,
                args.getString("resourceNodeId", ""));
            receipt.put("document", document);
            receipt.put("images", captureImages(instrumentation, view, context, hashes));
        } catch (Throwable error) {
            failure = error;
            receipt.put("diagnosticError", error.toString());
        } finally {
            try { receipt.put("networkRestored", FolioleArticleImageTestNetwork.restore(context)); }
            catch (Throwable error) {
                receipt.put("restoreError", error.toString());
                if (failure == null) failure = error;
            }
            if (activity != null) {
                Activity captured = activity;
                instrumentation.runOnMainSync(captured::finish);
            }
            Bundle evidence = new Bundle();
            evidence.putString("folioleS220ResourceDiagnostic", receipt.toString());
            instrumentation.sendStatus(2, evidence);
        }
        if (failure != null) throw new AssertionError("S220 resource diagnostic failed", failure);
    }

    private static Activity openNode(Instrumentation instrumentation, Context context,
        Bundle args) {
        String groupId = args.getString("resourceGroupId", "");
        String nodeId = args.getString("resourceNodeId", "");
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("foliole://node/v1?group="
            + Uri.encode(groupId) + "&id=" + Uri.encode(nodeId)));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(
            MainActivity.class.getName(), null, false);
        context.startActivity(intent);
        Activity activity = instrumentation.waitForMonitorWithTimeout(monitor, 30_000);
        instrumentation.removeMonitor(monitor);
        assertNotNull("S220 resource node must open once while offline", activity);
        return activity;
    }

    private static JSONObject waitForDocument(Instrumentation instrumentation, WebView view,
        String nodeId) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        JSONObject observed = new JSONObject();
        while (System.nanoTime() < deadline) {
            observed = FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, view,
                "(function(){var root=document.querySelector('[data-companion-readable-document]');" +
                    "var text=root?.innerText||'';var images=Array.from(root?.querySelectorAll('img')||[]);" +
                    "return JSON.stringify({node:root?.getAttribute('data-node-id')||null," +
                    "bodyReadable:text.includes(" + JSONObject.quote(BODY_MARKER) + ")," +
                    "text:text.slice(0,1600),widgets:root?.querySelectorAll(" +
                    "'.cm-md-image-widget').length||0,images:images.length,loadedImages:" +
                    "images.filter(i=>i.complete&&i.naturalWidth>0).length});})()");
            if (nodeId.equals(observed.optString("node")) && observed.optBoolean("bodyReadable")
                && observed.optInt("widgets") == 2) {
                return observed;
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("S220 resource document body did not become readable: "
            + observed);
    }

    private static JSONArray captureImages(Instrumentation instrumentation, WebView view,
        Context context, JSONArray hashes) throws Exception {
        startBrowserDiagnostics(instrumentation, view, hashes);
        JSONArray nativeFacts = new JSONArray();
        for (int index = 0; index < hashes.length(); index += 1) {
            String hash = hashes.getString(index);
            String storageKey = hash + ".png";
            File file = new File(new File(context.getFilesDir(), "attachments"), storageKey);
            JSObject resolver = FolioleCompanionAttachmentFileResolver.resolve(
                context, hash, "image/png", storageKey);
            nativeFacts.put(new JSONObject().put("hash", hash).put("resolver", resolver)
                .put("local", new JSONObject().put("exists", file.isFile())
                    .put("size", file.isFile() ? file.length() : -1)
                    .put("hashMatches", file.isFile() && hash.equals(
                        FolioleCompanionResourceAvailability.digest(Files.readAllBytes(file.toPath()))))));
        }
        JSONObject browser = waitForBrowserDiagnostics(instrumentation, view);
        JSONArray result = new JSONArray();
        for (int index = 0; index < nativeFacts.length(); index += 1) {
            JSONObject nativeFact = nativeFacts.getJSONObject(index);
            String hash = nativeFact.getString("hash");
            result.put(nativeFact.put("browser", browser.optJSONObject(hash)));
        }
        return result;
    }

    private static void startBrowserDiagnostics(Instrumentation instrumentation, WebView view,
        JSONArray hashes) throws Exception {
        String script = "(function(){var hashes=" + hashes + ";var root=document.querySelector(" +
            "'[data-companion-readable-document]');var started=performance.now();var watched=new WeakSet();" +
            "var out={state:'watching'};for(const hash of hashes)out[hash]={timeline:[],terminal:null," +
            "final:null,signature:null};var observer=null;var timer=null;function findWidget(hash){return " +
            "Array.from(root?.querySelectorAll('.cm-md-image-widget')||[]).find(w=>" +
            "(w.dataset.mdImageSource||'').includes(hash))||null}function snapshot(hash,event){var widget=" +
            "findWidget(hash);var status=widget?.querySelector('[data-md-image-status]')||null;var img=" +
            "widget?.querySelector('img')||null;if(img&&!watched.has(img)){watched.add(img);" +
            "img.addEventListener('load',()=>record(hash,'load'));img.addEventListener('error'," +
            "()=>record(hash,'error'))}return {elapsedMs:Math.round(performance.now()-started),event:event," +
            "widget:widget?{present:true,source:widget.dataset.mdImageSource||null,attachmentId:" +
            "widget.dataset.mdImageAttachmentId||null,status:status?.getAttribute(" +
            "'data-md-image-status')||null,html:widget.outerHTML.slice(0,2400)}:{present:false}," +
            "dom:img?{src:img.src,currentSrc:img.currentSrc,complete:img.complete,naturalWidth:" +
            "img.naturalWidth,naturalHeight:img.naturalHeight}:null}}function record(hash,event){var entry=" +
            "out[hash];if(entry.terminal)return;var fact=snapshot(hash,event);var signature=JSON.stringify(" +
            "[fact.widget.status,fact.widget.html,fact.dom]);if(signature!==entry.signature||event==='load'||" +
            "event==='error'||event==='timeout'){entry.signature=signature;entry.timeline.push(fact)}if(" +
            "fact.dom?.complete&&fact.dom.naturalWidth>0){entry.terminal='ready';entry.final=fact}else if(" +
            "fact.widget.status==='unavailable'){entry.terminal='unavailable';entry.final=fact}finishIfDone()}" +
            "function finishIfDone(){if(!hashes.every(hash=>out[hash].terminal))return;if(observer)" +
            "observer.disconnect();if(timer)clearTimeout(timer);out.state='done'}observer=new MutationObserver(" +
            "()=>{for(const hash of hashes)record(hash,'mutation')});observer.observe(root,{subtree:true," +
            "childList:true,attributes:true,attributeFilter:['src','data-md-image-status']});for(const hash " +
            "of hashes)record(hash,'initial');if(out.state!=='done')timer=setTimeout(()=>{for(const hash of " +
            "hashes){if(out[hash].terminal)continue;var fact=snapshot(hash,'timeout');out[hash].timeline" +
            ".push(fact);out[hash].terminal='timeout';out[hash].final=fact}finishIfDone()},90000);" +
            "window.__s220ResourceDiagnostic=out;return JSON.stringify({started:true});})()";
        assertTrue(FolioleCompanionWebViewSemanticAdapter.evaluateJson(
            instrumentation, view, script).optBoolean("started"));
    }

    private static JSONObject waitForBrowserDiagnostics(Instrumentation instrumentation,
        WebView view) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(95);
        JSONObject result = new JSONObject();
        while (System.nanoTime() < deadline) {
            result = FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, view,
                "JSON.stringify(window.__s220ResourceDiagnostic||{})");
            if ("done".equals(result.optString("state"))) return result;
            if ("failed".equals(result.optString("state"))) break;
            Thread.sleep(100);
        }
        throw new IllegalStateException("S220 browser resource diagnostic failed: " + result);
    }

    private static String requireHash(Bundle args, String key) {
        String hash = args.getString(key, "");
        assertTrue(hash.matches("[a-f0-9]{64}"));
        return hash;
    }
}
