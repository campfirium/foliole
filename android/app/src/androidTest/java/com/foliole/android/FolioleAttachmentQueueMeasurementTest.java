package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleAttachmentQueueMeasurementTest {
    private static final String APP_ID = "com.campfirium.foliole.android.acceptance";
    private static final String PLUGIN = "FolioleCompanionSync";
    private static final String DATABASE = "attachment-queue-measurement";
    private final List<File> ownedFiles = new ArrayList<>();
    private Context context;
    private Bridge bridge;

    @Test public void measuresRealPluginQueuesDuringAttachmentMaintenance() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        context = instrumentation.getTargetContext();
        assertEquals("Refusing a product package", APP_ID, context.getPackageName());
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(APP_ID);
        assertNotNull(launch);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        BridgeActivity activity = (BridgeActivity) instrumentation.startActivitySync(launch);
        bridge = activity.getBridge();
        assertNotNull(bridge.getPlugin(PLUGIN));
        assertNotNull(bridge.getPlugin("CapacitorSQLite"));
        JSONObject result = new JSONObject().put("appId", APP_ID).put("scenario", "attachment-queue");
        try {
            sql("createConnection", new JSObject().put("version", 1)).await();
            sql("open", new JSObject()).await();
            String image = seedFile(4096);
            String large = seedFile(32 * 1024 * 1024);
            JSONArray runs = new JSONArray();
            for (int index = 0; index < 5; index++) runs.put(measurePair(image, large));
            result.put("runs", runs).put("status", "passed");
        } finally {
            sql("closeConnection", new JSObject()).await();
            context.deleteDatabase(DATABASE + "SQLite.db");
            for (File file : ownedFiles) Files.deleteIfExists(file.toPath());
        }
        result.put("cleanup", true);
        Files.write(new File(context.getFilesDir(), "attachment-queue-result.json").toPath(),
            result.toString().getBytes(StandardCharsets.UTF_8));
        instrumentation.runOnMainSync(activity::finish);
    }

    private JSONObject measurePair(String image, String large) throws Exception {
        FolioleTimedPluginCall baselineImage = resolve(image);
        FolioleTimedPluginCall baselineSql = query();
        baselineImage.await();
        baselineSql.await();
        FolioleTimedPluginCall maintenance = FolioleTimedPluginCall.submit(bridge, PLUGIN,
            "maintainAttachmentFiles", new JSObject().put("operation", "move")
                .put("storageKey", large).put("trash", true));
        FolioleTimedPluginCall imageDuring = resolve(image);
        FolioleTimedPluginCall sqlDuring = query();
        assertEquals("ready", imageDuring.await().getString("status"));
        assertEquals(1, sqlDuring.await().getJSONArray("values").getJSONObject(0).getInt("value"));
        maintenance.await();
        JSONObject result = new JSONObject().put("baselineImage", baselineImage.measurement())
            .put("baselineSql", baselineSql.measurement()).put("maintenance", maintenance.measurement())
            .put("imageDuring", imageDuring.measurement()).put("sqlDuring", sqlDuring.measurement());
        FolioleTimedPluginCall.submit(bridge, PLUGIN, "maintainAttachmentFiles", new JSObject()
            .put("operation", "move").put("storageKey", large).put("trash", false)).await();
        return result;
    }

    private FolioleTimedPluginCall resolve(String key) throws Exception {
        return FolioleTimedPluginCall.submit(bridge, PLUGIN, "resolveAttachmentResource", new JSObject()
            .put(FolioleCompanionBridgeContractDefinitions.resourceContentHashRequestKey(context), key.substring(0, 64))
            .put(FolioleCompanionBridgeContractDefinitions.resourceMimeTypeRequestKey(context), "image/png")
            .put(FolioleCompanionBridgeContractDefinitions.resourceStorageKeyRequestKey(context), key));
    }

    private FolioleTimedPluginCall query() {
        return sql("query", new JSObject().put("statement", "SELECT 1 AS value").put("values", new JSArray()));
    }

    private FolioleTimedPluginCall sql(String method, JSObject data) {
        return FolioleTimedPluginCall.submit(bridge, "CapacitorSQLite", method,
            data.put("database", DATABASE).put("readonly", false));
    }

    private String seedFile(int size) throws Exception {
        byte[] bytes = new byte[size];
        byte[] nonce = UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8);
        System.arraycopy(nonce, 0, bytes, 0, nonce.length);
        StringBuilder hash = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hash.append(String.format("%02x", value));
        String key = hash + ".png";
        File active = new File(context.getFilesDir(), "attachments/" + key);
        File trash = new File(context.getFilesDir(), "attachments.trash/" + key);
        assertTrue(active.getParentFile().isDirectory() || active.getParentFile().mkdirs());
        assertTrue(!active.exists() && !trash.exists());
        ownedFiles.add(active);
        ownedFiles.add(trash);
        Files.write(active.toPath(), bytes);
        return key;
    }
}
