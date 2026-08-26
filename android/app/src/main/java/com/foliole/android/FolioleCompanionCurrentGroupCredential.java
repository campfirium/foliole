package com.foliole.android;

import org.json.JSONObject;

final class FolioleCompanionCurrentGroupCredential {
    final String deviceId;
    final String workgroupKey;

    private FolioleCompanionCurrentGroupCredential(
        String deviceId,
        String workgroupKey
    ) {
        this.deviceId = deviceId;
        this.workgroupKey = workgroupKey;
    }

    static FolioleCompanionCurrentGroupCredential load(String groupId) throws Exception {
        JSONObject result = FolioleCompanionSyncGroupDataBridge.current().request(
            "load_current_credential", new JSONObject().put("group_id", groupId.trim())
        );
        String deviceId = result.optString("device_id", null);
        String workgroupKey = result.optString("workgroup_key", null);
        if (blank(deviceId) || blank(workgroupKey)) {
            throw new SecurityException("sync_group_current_credential_invalid");
        }
        return new FolioleCompanionCurrentGroupCredential(
            deviceId.trim(), workgroupKey.trim()
        );
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
