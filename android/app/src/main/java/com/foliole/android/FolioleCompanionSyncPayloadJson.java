package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncPayloadJson {
    private FolioleCompanionSyncPayloadJson() {}

    static JSONObject payload(Context context, JSONObject record) throws Exception {
        Object payloadValue = record.opt(payloadJsonKey(context));
        if (payloadValue == null || payloadValue == JSONObject.NULL) {
            return new JSONObject();
        }
        if (payloadValue instanceof JSONObject) {
            return (JSONObject) payloadValue;
        }
        String payloadJson = payloadValue.toString().trim();
        return payloadJson.isEmpty() || payloadJson.equals("null") ? new JSONObject() : new JSONObject(payloadJson);
    }

    private static String payloadJsonKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadRoutingRules.string(context, "payloadJsonKey");
    }
}
