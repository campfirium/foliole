package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.util.Map;

final class FolioleCompanionSyncGroupAdmissionAdapter {
    private final JSONObject config;
    private final Context context;
    private final Map<String, FolioleCompanionSyncGroupJoinRequest> requests;

    FolioleCompanionSyncGroupAdmissionAdapter(
        Context context,
        JSONObject config,
        Map<String, FolioleCompanionSyncGroupJoinRequest> requests
    ) {
        this.context = context.getApplicationContext();
        this.config = config;
        this.requests = requests;
    }

    void handleLegacy(
        FolioleCompanionHttpRequest request,
        java.io.OutputStream output,
        String remoteAddress
    ) throws Exception {
        JSONObject body = new JSONObject(request.bodyText());
        JSONObject group = config.getJSONObject("sync_group");
        JSONObject facts = body.optJSONObject("library_facts");
        if (!group.getString("group_id").equals(body.optString("group_id")) ||
            !config.getString("group_tag").equals(body.optString("group_tag"))) {
            respond(output, 409, "sync_group_identity_mismatch"); return;
        }
        if (!FolioleCompanionSyncGroupLibraryFacts.valid(facts)) {
            respond(output, 409, "sync_group_library_facts_invalid"); return;
        }
        if (!FolioleCompanionWorkgroupHttp.compatibleWith(protocol(), body.optJSONObject("protocol"))) {
            respond(output, 409, "sync_protocol_incompatible"); return;
        }
        FolioleCompanionSyncGroupProvider.pruneExpired(context);
        FolioleCompanionSyncGroupJoinRequest existing = requests.values().stream()
            .filter(item -> !item.status.equals("rejected") && item.matches(body)).findFirst().orElse(null);
        if (existing != null) { respondPending(output, existing); return; }
        FolioleCompanionSyncGroupJoinRequest pending =
            new FolioleCompanionSyncGroupJoinRequest(body, normalizeAddress(remoteAddress));
        requests.put(pending.pairRequestId, pending);
        FolioleCompanionSyncGroupProvider.notifyStateChanged();
        respondPending(output, pending);
    }

    JSONObject inactiveV4Admission(String providerRole) throws Exception {
        if (!"manager".equals(providerRole)) {
            return new JSONObject().put("error", "manager_required").put("status", 409);
        }
        return new JSONObject().put("error", "lifecycle_prepare_inactive").put("status", 503);
    }

    private void respondPending(
        java.io.OutputStream output,
        FolioleCompanionSyncGroupJoinRequest request
    ) throws Exception {
        FolioleCompanionHttpResponse.json(output, 202, request.publicJson()
            .put("compatibility", FolioleCompanionWorkgroupHttp.compatible(protocol()))
            .put("desktop_protocol", protocol()));
    }

    private void respond(java.io.OutputStream output, int status, String error) throws Exception {
        FolioleCompanionHttpResponse.json(output, status, new JSONObject().put("error", error));
    }

    private JSONObject protocol() throws Exception { return config.getJSONObject("protocol"); }

    private static String normalizeAddress(String value) {
        return value.startsWith("::ffff:") ? value.substring(7) : value;
    }
}
