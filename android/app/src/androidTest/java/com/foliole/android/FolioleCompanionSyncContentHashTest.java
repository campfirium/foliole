package com.foliole.android;

import static org.junit.Assert.assertEquals;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncContentHashTest {

    @Test
    public void hashesStableJsonWithSortedObjectKeys() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("size_bytes", 42);
        payload.put("original_name", "paper.pdf");
        payload.put("blob", new JSONObject()
            .put("content_hash", "sha256:abc")
            .put("availability", "local"));

        assertEquals(
            "19288a897b48757643d54a42f71c23c56db0e5e3ca0cd37b8b832ff7505c4418",
            FolioleCompanionSyncContentHash.hash(payload)
        );
    }

    @Test
    public void hashesLocalCompanionSyncPayloadsLikeDesktopStableJson() throws Exception {
        assertEquals(
            "ca3259fcfba0e46ac9792859418ce1c2e647697e6fa9bdd293a3b00d33f96cf3",
            FolioleCompanionSyncContentHash.hash(new JSONObject()
                .put("device_id", "android-1")
                .put("form_factor", "phone")
                .put("key", "app_settings")
                .put("platform", "android")
                .put("scope", "device")
                .put("value_json", "{\"theme\":\"dark\"}"))
        );
        assertEquals(
            "34219d3ae5784d7a8cd505cdfa1aeb36fccedf6e5b5e4109473f82cfc9ba361f",
            FolioleCompanionSyncContentHash.hash(new JSONObject()
                .put("difficulty", 4.5)
                .put("due", "2026-04-26T00:00:00.000Z")
                .put("elapsed_days", 2)
                .put("lapses", 1)
                .put("last_review_at", JSONObject.NULL)
                .put("node_id", "node-1")
                .put("reps", 5)
                .put("scheduled_days", 3)
                .put("stability", 6.5)
                .put("state", 2))
        );
    }
}
