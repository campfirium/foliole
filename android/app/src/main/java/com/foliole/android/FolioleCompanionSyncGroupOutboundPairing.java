package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupOutboundPairing {
    private FolioleCompanionSyncGroupOutboundPairing() {}

    static void save(
        Context context,
        JSONObject config,
        FolioleCompanionSyncGroupJoinRequest pending,
        FolioleCompanionSyncGroupDataBridge dataBridge
    ) throws Exception {
        String now = java.time.Instant.now().toString();
        String endpointUrl = "http://" + pending.remoteAddress + ":38641";
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, config.getJSONObject("sync_group").getString("group_id"),
            config.getString("device_id"), config.getString("host_name"),
            pending.deviceId, pending.hostName, pending.hostPlatform, endpointUrl
        );
        FolioleCompanionSyncGroupDatabase.saveSyncEndpoint(dataBridge, endpointUrl, now);
    }
}
