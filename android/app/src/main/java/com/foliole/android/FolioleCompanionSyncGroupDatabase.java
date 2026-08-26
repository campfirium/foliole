package com.foliole.android;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupDatabase {
    private FolioleCompanionSyncGroupDatabase() {}

    static void recordSupplyCursor(
        FolioleCompanionSyncGroupDataBridge bridge, String peerId, int fromCursor, int toCursor
    ) throws Exception {
        bridge.request("record_supply_cursor", new JSONObject().put("peer_id", peerId)
            .put("from_cursor", fromCursor).put("to_cursor", toCursor));
    }

    static void saveSyncEndpoint(
        FolioleCompanionSyncGroupDataBridge bridge, String endpointUrl, String now
    ) throws Exception {
        bridge.request("save_sync_endpoint", new JSONObject()
            .put("endpoint_url", endpointUrl).put("updated_at", now));
    }
}
