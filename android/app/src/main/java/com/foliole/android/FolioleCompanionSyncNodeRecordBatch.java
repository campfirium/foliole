package com.foliole.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

final class FolioleCompanionSyncNodeRecordBatch {

    private FolioleCompanionSyncNodeRecordBatch() {}

    static JSONArray latestBranchHeads(JSONArray records) {
        LinkedHashMap<String, JSONObject> byBranch = new LinkedHashMap<>();
        for (int index = 0; index < records.length(); index += 1) {
            JSONObject record = records.optJSONObject(index);
            if (record == null) {
                continue;
            }
            String key = record.optString("object_id") + "\n" + sourceDeviceId(record);
            JSONObject current = byBranch.get(key);
            if (current == null || compareHead(current, record) < 0) {
                byBranch.put(key, record);
            }
        }
        JSONArray result = new JSONArray();
        for (Map.Entry<String, JSONObject> entry : byBranch.entrySet()) {
            result.put(entry.getValue());
        }
        return result;
    }

    private static String sourceDeviceId(JSONObject record) {
        String deviceId = record.optString("device_id", "").trim();
        return deviceId.isEmpty() ? "remote" : deviceId;
    }

    private static int compareHead(JSONObject left, JSONObject right) {
        String leftTime = left.optString("version_created_at", left.optString("updated_at", ""));
        String rightTime = right.optString("version_created_at", right.optString("updated_at", ""));
        int timeCompare = leftTime.compareTo(rightTime);
        return timeCompare == 0
            ? left.optString("version_id", "").compareTo(right.optString("version_id", ""))
            : timeCompare;
    }
}
