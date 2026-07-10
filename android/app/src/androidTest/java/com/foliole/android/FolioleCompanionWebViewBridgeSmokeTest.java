package com.foliole.android;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionWebViewBridgeSmokeTest {
    private static final String CONTRACT_PACK_ASSET = "sync-pack-contract.syncpack";

    @Test
    public void exposesCapacitorSyncPluginsInMainWebView() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Activity activity = startMainActivity(instrumentation);
        try {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            JSONObject bridge = waitForBridge(instrumentation, webView);
            assertTrue(bridge.optBoolean("hasPlugins"));
            assertTrue(bridge.optBoolean("hasBootstrap"));
            assertTrue(bridge.optBoolean("hasSyncPackTransfer"));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    @Test
    public void appliesPackThroughWebViewSharedCoreProbe() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
        File packFile = new File(context.getCacheDir(), CONTRACT_PACK_ASSET);
        copyTestAsset(instrumentation, CONTRACT_PACK_ASSET, packFile);

        Activity activity = startMainActivity(instrumentation);
        try (FolioleCompanionSyncPackContainer.PreparedPack preparedPack =
                 FolioleCompanionSyncPackContainer.prepare(packFile)) {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            waitForBridge(instrumentation, webView);
            loadProbeUrl(instrumentation, webView);
            waitForProbe(instrumentation, webView);

            JSONObject applyResult = applyPackPath(instrumentation, webView, preparedPack.incomingFile.getAbsolutePath());

            assertTrue(applyResult.toString(), applyResult.optBoolean("ok"));
            JSONObject result = applyResult.getJSONObject("result");
            assertEquals(3, result.getInt("applied_object_count"));
            assertEquals(2, result.getInt("applied_blob_count"));
            assertEquals(3, result.getInt("to_state_seq"));
            assertEquals(3, countPackStateRows(context));
            assertEquals("4", selectNodeValue(context, "priority"));
            assertEquals("0.92", selectNodeValue(context, "desired_retention"));
            assertEquals("0", selectNodeValue(context, "enable_short_term"));
            assertEquals("1", selectNodeValue(context, "sequential_reading_enabled"));
            assertEquals("[\"child-2\",\"child-1\"]", selectNodeValue(context, "manual_child_order"));
            assertEquals("{\"kind\":\"manual\"}", selectNodeValue(context, "virtual_filter"));
            assertEquals("{\"id\":\"anchor-1\",\"kind\":\"highlight\"}", selectNodeValue(context, "anchor_link"));
            assertEquals("[{\"source\":\"contract\"}]", selectNodeValue(context, "image_regions"));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
            deleteFile(packFile);
            context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
        }
    }

    private static Activity startMainActivity(Instrumentation instrumentation) {
        Context context = instrumentation.getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) {
            throw new IllegalStateException("Main launch intent is missing.");
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private static JSONObject waitForBridge(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        JSONObject latest = new JSONObject();
        while (System.nanoTime() < deadline) {
            latest = evaluateBridgeState(instrumentation, webView);
            if (latest.optBoolean("hasBootstrap") && latest.optBoolean("hasSyncPackTransfer")) {
                return latest;
            }
            Thread.sleep(100);
        }
        return latest;
    }

    private static void loadProbeUrl(Instrumentation instrumentation, WebView webView) {
        instrumentation.runOnMainSync(() -> {
            String url = webView.getUrl();
            if (url == null || url.contains("foliole-sync-probe=1")) {
                return;
            }
            webView.loadUrl(url + (url.contains("?") ? "&" : "?") + "foliole-sync-probe=1");
        });
    }

    private static void waitForProbe(Instrumentation instrumentation, WebView webView) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            if (evaluateBoolean(instrumentation, webView, "!!window.__FOLIOLE_COMPANION_SYNC_APPLY_PROBE__")) {
                return;
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("Companion sync apply probe was not installed at " +
            evaluateRaw(instrumentation, webView, "window.location.href"));
    }

    private static JSONObject applyPackPath(
        Instrumentation instrumentation,
        WebView webView,
        String packPath
    ) throws Exception {
        String script = "(function(){window.__folioleSyncProbeResult=null;" +
            "window.__FOLIOLE_COMPANION_SYNC_APPLY_PROBE__.applyPackPath({packPath:" + JSONObject.quote(packPath) + "})" +
            ".then(function(result){window.__folioleSyncProbeResult=JSON.stringify({ok:true,result:result});})" +
            ".catch(function(error){window.__folioleSyncProbeResult=JSON.stringify({ok:false,error:String(error&&error.message||error)});});" +
            "return 'started';})()";
        evaluateRaw(instrumentation, webView, script);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            String raw = evaluateRaw(instrumentation, webView, "window.__folioleSyncProbeResult||''");
            String result = new JSONArray("[" + raw + "]").getString(0);
            if (!result.isEmpty()) {
                return new JSONObject(result);
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException("Timed out while applying sync pack through WebView probe.");
    }

    private static boolean evaluateBoolean(
        Instrumentation instrumentation,
        WebView webView,
        String script
    ) throws Exception {
        return new JSONArray("[" + evaluateRaw(instrumentation, webView, script) + "]").getBoolean(0);
    }

    private static JSONObject evaluateBridgeState(Instrumentation instrumentation, WebView webView) throws Exception {
        return new JSONObject(new JSONArray("[" + evaluateRaw(
            instrumentation,
            webView,
            "(function(){var plugins=(window.Capacitor&&window.Capacitor.Plugins)||{};" +
                "return JSON.stringify({hasPlugins:!!window.Capacitor&&!!window.Capacitor.Plugins," +
                "hasBootstrap:!!plugins.FolioleCompanionBootstrap," +
                "hasSyncPackTransfer:!!plugins.FolioleCompanionSyncPackTransfer});})()"
        ) + "]").getString(0));
    }

    private static String evaluateRaw(Instrumentation instrumentation, WebView webView, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> rawResult = new AtomicReference<>("");
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript(script, value -> {
            rawResult.set(value);
            latch.countDown();
        }));
        if (!latch.await(2, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Timed out while evaluating WebView bridge.");
        }
        return rawResult.get();
    }

    private static void copyTestAsset(Instrumentation instrumentation, String name, File target) throws Exception {
        deleteFile(target);
        try (
            InputStream inputStream = instrumentation.getContext().getAssets().open(name);
            FileOutputStream outputStream = new FileOutputStream(target)
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
        }
    }

    private static int countPackStateRows(Context context) {
        try (
            SQLiteDatabase database = SQLiteDatabase.openDatabase(
                context.getDatabasePath(FolioleCompanionDatabaseHelper.DATABASE_NAME).getAbsolutePath(),
                null,
                SQLiteDatabase.OPEN_READONLY
            );
            Cursor cursor = database.rawQuery(
                "SELECT COUNT(*) FROM sync_object_state WHERE " +
                    "(object_type = 'node' AND object_id = 'node-1') OR " +
                    "(object_type = 'external_document' AND object_id = 'folder-1:doc.md') OR " +
                    "(object_type = 'setting' AND object_id = 'user_space:windows:desktop:*:app_settings')",
                null
            )
        ) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private static String selectNodeValue(Context context, String column) {
        return FolioleCompanionWebViewBridgeDatabaseAssertions.selectNodeValue(context, column);
    }

    private static void deleteFile(File file) {
        if (file != null && file.exists() && !file.delete()) {
            file.deleteOnExit();
        }
    }
}
