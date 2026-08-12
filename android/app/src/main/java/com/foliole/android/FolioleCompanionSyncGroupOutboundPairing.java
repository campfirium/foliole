package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupOutboundPairing {
    private FolioleCompanionSyncGroupOutboundPairing() {}

    static void save(
        Context context,
        JSONObject config,
        FolioleCompanionSyncGroupJoinRequest pending,
        String secret,
        FolioleCompanionSyncGroupDataBridge dataBridge
    ) throws Exception {
        String now = java.time.Instant.now().toString();
        String endpointUrl = "http://" + pending.remoteAddress + ":38641";
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, config.getJSONObject("sync_group").getString("group_id"),
            config.getString("device_id"), pending.deviceId, endpointUrl, secret
        );
        FolioleCompanionSyncGroupDatabase.saveSyncEndpoint(dataBridge, endpointUrl, now);
    }
}
