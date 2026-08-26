package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupSigning {
    private FolioleCompanionSyncGroupSigning() {}

    static JSObject sign(Context context, PluginCall call) throws Exception {
        String groupId = required(call, "sync_group_id");
        String endpointUrl = required(call, "endpoint_url");
        String method = required(call, "method");
        String path = required(call, "path_with_query");
        FolioleCompanionCurrentGroupCredential credential = FolioleCompanionCurrentGroupCredential.load(groupId);
        String body = call.getString("body");
        if (body != null) {
            JSONObject headers = new JSONObject().put("X-Sync-Group-Id", groupId)
                .put("X-Device-Id", credential.deviceId);
            FolioleCompanionWorkgroupHttp.PreparedRequest prepared = FolioleCompanionWorkgroupHttp.prepareWithKey(
                context, endpointUrl + path, method, headers, body, credential.workgroupKey);
            return new JSObject().put("body", prepared.body).put("headers", prepared.headers);
        }
        String timestamp = required(call, "timestamp");
        String nonce = required(call, "nonce");
        String bodyHash = required(call, "body_hash");
        String canonical = method.toUpperCase() + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + bodyHash;
        return new JSObject().put("headers", new JSONObject()
            .put("X-Device-Id", credential.deviceId)
            .put("X-Nonce", nonce)
            .put("X-Signature", FolioleCompanionSyncGroupHmac.sign(credential.workgroupKey, canonical))
            .put("X-Timestamp", timestamp));
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }
}
