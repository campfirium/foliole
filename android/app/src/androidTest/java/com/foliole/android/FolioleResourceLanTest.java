package com.foliole.android;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import java.io.FileOutputStream;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FolioleResourceLanTest {
    @Test public void readsResourcesAcrossPhysicalLanAndRestoresMissingBytes() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("com.foliole.android.acceptance", context.getPackageName());
        Bundle args = InstrumentationRegistry.getArguments();
        String phase = args.getString("resourcePhase", "");
        assertTrue(phase.matches("missing|restored|restarted"));
        String nodeId = args.getString("resourceNodeId", "");
        String groupId = args.getString("resourceGroupId", "");
        String url = "foliole://node/v1?group=" + Uri.encode(groupId) + "&id=" + Uri.encode(nodeId);
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(MainActivity.class.getName(), null, false);
        context.startActivity(intent);
        Activity activity = instrumentation.waitForMonitorWithTimeout(monitor, 30_000);
        instrumentation.removeMonitor(monitor);
        assertNotNull("Resource article must open through the registered system URL", activity);
        try {
            WebView view = activity.findViewById(R.id.webview);
            JSONObject observation = waitForResources(instrumentation, view, context, args, phase, nodeId);
            Bitmap screenshot = instrumentation.getUiAutomation().takeScreenshot();
            assertNotNull(screenshot);
            try (FileOutputStream output = new FileOutputStream(new File(context.getExternalFilesDir(null),
                "resource-" + phase + ".png"))) {
                assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, output));
            } finally { screenshot.recycle(); }
            Bundle evidence = new Bundle();
            evidence.putString("folioleResourceLanReceipt", observation.put("passed", true)
                .put("phase", phase).put("nodeId", nodeId)
                .put("lanEndpoint", discoverLanProvider(context, groupId)).toString());
            instrumentation.sendStatus(2, evidence);
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    private static JSONObject waitForResources(Instrumentation instrumentation, WebView view,
        Context context, Bundle args, String phase, String nodeId) throws Exception {
        File good = attachment(context, args.getString("availableHash", ""));
        File recovering = attachment(context, args.getString("recoveringHash", ""));
        long deadline = System.nanoTime() + 90_000_000_000L;
        JSONObject observed = new JSONObject();
        while (System.nanoTime() < deadline) {
            observed = FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, view,
                "JSON.stringify({node:document.querySelector('[data-companion-readable-document]')?.getAttribute('data-node-id')," +
                "linkError:document.querySelector('[data-mobile-link-error]')?.getAttribute('data-mobile-link-error')," +
                "surface:document.body.innerText.slice(0,1600),bodyReadable:document.body.innerText.includes('Resource LAN body remains readable.')," +
                "loadedImages:Array.from(document.querySelectorAll('[data-companion-readable-document] img'))" +
                ".filter(i=>i.complete&&i.naturalWidth>0).length})");
            boolean resources = good.isFile() && ("missing".equals(phase) ? !recovering.exists() : recovering.isFile());
            int requiredImages = "missing".equals(phase) ? 1 : 2;
            if (nodeId.equals(observed.optString("node")) && observed.optBoolean("bodyReadable")
                && resources && observed.optInt("loadedImages") >= requiredImages) {
                assertEquals(args.getString("availableHash"), digest(good));
                if (!"missing".equals(phase)) assertEquals(args.getString("recoveringHash"), digest(recovering));
                return observed.put("availableHashVerified", true)
                    .put("recoveringHashVerified", !"missing".equals(phase));
            }
            Thread.sleep(200);
        }
        throw new IllegalStateException("Physical LAN resource observation timed out: " + observed);
    }

    private static String discoverLanProvider(Context context, String groupId) throws Exception {
        for (JSObject candidate : FolioleCompanionNsdDiscovery.discoverCandidates(context)) {
            String endpoint = candidate.optString(FolioleCompanionHostBridgeContractDefinitions
                .networkEndpointUrlCandidateKey(context));
            if (endpoint.contains("127.0.0.1") || endpoint.contains("localhost") || endpoint.contains("[::1]")) continue;
            JSObject response = FolioleCompanionDesktopHttpClient.request(context,
                endpoint + "/companion/discovery", "GET", new JSONObject(), null);
            JSONObject discovery = new JSONObject(response.getString(
                FolioleCompanionHostBridgeContractDefinitions.networkBodyResponseKey(context)));
            if (groupId.equals(discovery.optString("group_id"))
                && ("macOS".equals(discovery.optString("provider_platform"))
                    || "darwin".equals(discovery.optString("provider_platform")))) return endpoint;
        }
        throw new IllegalStateException("Physical LAN Mac provider discovery was not verified.");
    }

    private static File attachment(Context context, String hash) {
        assertTrue(hash.matches("[a-f0-9]{64}"));
        return new File(new File(context.getFilesDir(), "attachments"), hash + ".png");
    }
    private static String digest(File file) throws Exception {
        return FolioleCompanionResourceAvailability.digest(Files.readAllBytes(file.toPath()));
    }
}
