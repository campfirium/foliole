package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

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
        JSONObject protocol = config.getJSONObject("protocol");
        JSObject remoteProtocol = new JSObject();
        for (String key : new String[] {
            "version", "min_supported_version", "max_supported_version", "capabilities"
        }) {
            remoteProtocol.put(key, protocol.get(key));
        }
        FolioleCompanionPairingStore.savePairingCredentials(
            context, config.getString("device_id"), pending.deviceKind, pending.deviceName,
            secret, protocol.getInt("version"), now, pending.deviceId, pending.deviceId,
            pending.deviceName, pending.deviceKind, remoteProtocol
        );
        FolioleCompanionSyncGroupDatabase.saveSyncEndpoint(dataBridge, endpointUrl, now);
    }
}
