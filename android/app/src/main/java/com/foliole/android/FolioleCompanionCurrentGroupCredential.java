package com.foliole.android;

import org.json.JSONObject;

final class FolioleCompanionCurrentGroupCredential {
    final String authorizationId;
    final String workgroupKey;

    private FolioleCompanionCurrentGroupCredential(
        String authorizationId,
        String workgroupKey
    ) {
        this.authorizationId = authorizationId;
        this.workgroupKey = workgroupKey;
    }

    static FolioleCompanionCurrentGroupCredential load(String groupId) throws Exception {
        JSONObject result = FolioleCompanionSyncGroupDataBridge.current().request(
            "load_current_credential", new JSONObject().put("group_id", groupId.trim())
        );
        String authorizationId = result.optString("authorization_id", null);
        String workgroupKey = result.optString("workgroup_key", null);
        if (blank(authorizationId) || blank(workgroupKey)) {
            throw new SecurityException("sync_group_current_credential_invalid");
        }
        return new FolioleCompanionCurrentGroupCredential(
            authorizationId.trim(), workgroupKey.trim()
        );
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
