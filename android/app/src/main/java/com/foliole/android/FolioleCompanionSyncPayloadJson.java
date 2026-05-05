package com.foliole.android;

import org.json.JSONObject;

final class FolioleCompanionSyncPayloadJson {
    private FolioleCompanionSyncPayloadJson() {}

    static JSONObject payload(JSONObject record) throws Exception {
        Object payloadValue = record.opt("payload_json");
        if (payloadValue == null || payloadValue == JSONObject.NULL) {
            return new JSONObject();
        }
        if (payloadValue instanceof JSONObject) {
            return (JSONObject) payloadValue;
        }
        String payloadJson = payloadValue.toString().trim();
        return payloadJson.isEmpty() || payloadJson.equals("null") ? new JSONObject() : new JSONObject(payloadJson);
    }
}
