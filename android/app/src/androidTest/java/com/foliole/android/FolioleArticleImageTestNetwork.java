package com.foliole.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.net.ConnectivityManager;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;

/** Temporary test-device network preparation, with an explicit persisted restoration receipt. */
final class FolioleArticleImageTestNetwork {
    private static File stateFile(Context context) { return new File(context.getCacheDir(), "s203-network-state.json"); }

    static JSONObject disconnect(Context context) throws Exception {
        File state = stateFile(context);
        assertFalse("Restore the previous owned network preparation first", state.exists());
        JSONObject before = new JSONObject().put("wifi", Settings.Global.getInt(context.getContentResolver(), "wifi_on", 0))
            .put("data", Settings.Global.getInt(context.getContentResolver(), "mobile_data", 0))
            .put("connected", ((ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE)).getActiveNetwork() != null);
        Files.write(state.toPath(), before.toString().getBytes(StandardCharsets.UTF_8));
        try {
            shell("svc wifi disable");
            shell("svc data disable");
            ConnectivityManager network = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            long deadline = android.os.SystemClock.elapsedRealtime() + 10000;
            while (network.getActiveNetwork() != null && android.os.SystemClock.elapsedRealtime() < deadline) Thread.sleep(100);
            assertNull("The source-failure precondition requires no active network", network.getActiveNetwork());
            return new JSONObject().put("offline", true).put("previous", before);
        } catch (Throwable error) { restore(context); throw error; }
    }

    static JSONObject restore(Context context) throws Exception {
        File state = stateFile(context);
        assertTrue("No owned network preparation to restore", state.isFile());
        JSONObject before = new JSONObject(new String(Files.readAllBytes(state.toPath()), StandardCharsets.UTF_8));
        shell("svc wifi " + (before.getInt("wifi") == 0 ? "disable" : "enable"));
        shell("svc data " + (before.getInt("data") == 0 ? "disable" : "enable"));
        ConnectivityManager network = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        long deadline = android.os.SystemClock.elapsedRealtime() + 15000;
        while (before.getBoolean("connected") && network.getActiveNetwork() == null
            && android.os.SystemClock.elapsedRealtime() < deadline) Thread.sleep(100);
        if (before.getBoolean("connected")) assertNotNull("Restore the device connection before completing", network.getActiveNetwork());
        assertEquals(before.getInt("wifi"), Settings.Global.getInt(context.getContentResolver(), "wifi_on", 0));
        assertEquals(before.getInt("data"), Settings.Global.getInt(context.getContentResolver(), "mobile_data", 0));
        Files.delete(state.toPath());
        return new JSONObject().put("restored", true).put("previous", before);
    }

    static JSONArray imageTraffic(String pid) throws Exception {
        assertTrue(pid.matches("[0-9]{1,8}"));
        String log = shell("logcat -d -v epoch --pid=" + pid + " FolioleImage:D *:S");
        JSONArray entries = new JSONArray();
        for (String line : log.split("\n")) {
            if (line.contains("FolioleImage") && (line.contains("readRemoteImageResponse")
                || line.contains("resolveAttachmentResource"))) entries.put(line);
        }
        return entries;
    }

    private static String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
             java.io.InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
