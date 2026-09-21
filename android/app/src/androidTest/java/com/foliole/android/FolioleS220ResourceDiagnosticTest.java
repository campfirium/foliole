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
            if (nodeId.equals(observed.optString("node")) && observed.optBoolean("bodyReadable")) {
                return observed;
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("S220 resource document body did not become readable: "
            + observed);
    }

    private static JSONArray captureImages(Instrumentation instrumentation, WebView view,
        Context context, JSONArray hashes) throws Exception {
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
        startBrowserDiagnostics(instrumentation, view, hashes);
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
        String script = "(function(){window.__s220ResourceDiagnostic={state:'pending'};" +
            "(async function(){var out={state:'done'};var root=document.querySelector(" +
            "'[data-companion-readable-document]');for(const hash of " + hashes + "){var widget=" +
            "Array.from(root?.querySelectorAll('.cm-md-image-widget')||[]).find(w=>" +
            "(w.dataset.mdImageSource||'').includes(hash));var img=widget?.querySelector('img')||null;" +
            "var status=widget?.querySelector('[data-md-image-status]')||null;var fact={widget:widget?" +
            "{present:true,source:widget.dataset.mdImageSource||null,attachmentId:" +
            "widget.dataset.mdImageAttachmentId||null,status:status?.getAttribute(" +
            "'data-md-image-status')||null,html:widget.outerHTML.slice(0,2400)}:{present:false}," +
            "dom:img?{src:img.src," +
            "currentSrc:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth," +
            "naturalHeight:img.naturalHeight}:null};if(img){try{var controller=new AbortController();" +
            "var timeout=setTimeout(()=>controller.abort(),5000);var response=await fetch(img.src," +
            "{signal:controller.signal});var bytes=(await response.arrayBuffer()).byteLength;" +
            "clearTimeout(timeout);fact.fetch={ok:response.ok,status:response.status," +
            "contentType:response.headers.get('content-type'),bytes:bytes};}catch(e){" +
            "fact.fetch={ok:false,error:String(e)}}try{await img.decode();fact.decode={status:'decoded'}}" +
            "catch(e){fact.decode={status:'rejected',error:String(e)}}}out[hash]=fact;}" +
            "window.__s220ResourceDiagnostic=out;})().catch(e=>window.__s220ResourceDiagnostic=" +
            "{state:'failed',error:String(e)});return JSON.stringify({started:true});})()";
        assertTrue(FolioleCompanionWebViewSemanticAdapter.evaluateJson(
            instrumentation, view, script).optBoolean("started"));
    }

    private static JSONObject waitForBrowserDiagnostics(Instrumentation instrumentation,
        WebView view) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
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
