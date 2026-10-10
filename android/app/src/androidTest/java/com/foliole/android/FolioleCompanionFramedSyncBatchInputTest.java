package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class FolioleCompanionFramedSyncBatchInputTest {
    @Test public void preservesVersionSelectorsAcrossTheRendererJsonBoundary() throws Exception {
        assertVersionSelectors(new JSONArray().put("version-2").put("version-1"));
    }

    @Test public void preservesAnExplicitEmptyVersionSelection() throws Exception {
        assertVersionSelectors(new JSONArray());
    }

    private static void assertVersionSelectors(JSONArray ids) throws Exception {
        JSONObject transfer = new JSONObject().put("object_id", "node-1")
            .put("object_type", "node").put("include_current_node", true)
            .put("frontier_fact_ids", ids).put("required_relation_ids", new JSONArray())
            .put("review_fact_ids", new JSONArray()).put("state_fact_ids", new JSONArray());
        JSObject input = new JSObject().put("sync_group_id", "group-1")
            .put("receiver_device_id", "receiver").put("receiver_library_epoch", "epoch-r")
            .put("transfers", new JSONArray().put(transfer));
        PluginCall call = new PluginCall(null, "FolioleCompanionSync", "1", "sendFramedSyncTransfers", input);
        JSONObject selection = FolioleCompanionFramedSyncBatchInput.selections(call, "sender", "epoch-s").get(0);
        JSONObject rendererPayload = new JSONObject(selection.toString());
        assertTrue(rendererPayload.get("frontier_fact_ids") instanceof JSONArray);
        assertEquals(ids.toString(), rendererPayload.getJSONArray("frontier_fact_ids").toString());
        assertEquals("node-1", rendererPayload.getString("object_id"));
        assertEquals("receiver", rendererPayload.getString("receiver_device_id"));
    }
}
