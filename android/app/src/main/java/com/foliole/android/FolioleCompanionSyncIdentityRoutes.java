package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

final class FolioleCompanionSyncIdentityRoutes {
    private FolioleCompanionSyncIdentityRoutes() {}

    static boolean supports(String path) {
        return path.equals("/companion/sync-identity-summary")
            || path.equals("/companion/sync-identity-page")
            || path.equals("/companion/sync-identity-global-summary")
            || path.equals("/companion/sync-identity-global-page")
            || path.equals("/companion/sync-identity-fact-summary")
            || path.equals("/companion/sync-identity-fact-page")
            || path.equals("/companion/sync-identity-fact-global-page")
            || path.equals("/companion/sync-identity-node-facts")
            || path.equals("/companion/sync-identity-changed-page");
    }

    static void handle(Context context, JSONObject config, FolioleCompanionSyncGroupDataBridge bridge,
            FolioleCompanionSyncGroupSnapshot snapshots, FolioleCompanionHttpRequest request,
            OutputStream output, String peer) throws Exception {
        String path = request.path.split("\\?", 2)[0];
        String kind = kind(path);
        try {
            JSONObject response = kind.equals("summary") || kind.equals("global_summary")
                ? snapshots.refreshIdentity(peer, snapshot -> read(bridge, request, kind, snapshot))
                : snapshots.read(peer, snapshot -> read(bridge, request, kind, snapshot));
            FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output, 200, response);
        } catch (IllegalArgumentException | IllegalStateException failure) {
            String code = failure.getMessage();
            int status = code != null && (code.contains("view_unavailable")
                || code.contains("view_changed") || code.contains("item_too_large")) ? 409 : 400;
            FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output,
                status, new JSONObject().put("error", code == null ? "sync_identity_request_invalid" : code));
        }
    }

    static void pack(Context context, JSONObject config, FolioleCompanionSyncGroupDataBridge bridge,
            FolioleCompanionSyncGroupSnapshot snapshots, FolioleCompanionHttpRequest request,
            OutputStream output, String peer, JSONObject page) throws Exception {
        try {
            byte[] archive = snapshots.read(peer, snapshot -> {
                String viewId = UUID.nameUUIDFromBytes(
                    snapshot.getBytes(StandardCharsets.UTF_8)).toString();
                bridge.request("prepare_identity_pack", new JSONObject()
                    .put("snapshot_path", snapshot).put("source_view_id", viewId)
                    .put("authenticated_device_id", peer).put("page", page));
                return FolioleCompanionSyncIdentityPackBuilder.build(context, snapshot, page);
            });
            FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output,
                200, "application/zip", archive);
        } catch (IllegalArgumentException | IllegalStateException failure) {
            String code = failure.getMessage();
            int status = code != null && (code.contains("view") || code.contains("over_budget") ||
                code.contains("source_changed")) ? 409 : 400;
            FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output,
                status, new JSONObject().put("error", code == null ? "sync_identity_request_invalid" : code));
        }
    }

    private static JSONObject read(FolioleCompanionSyncGroupDataBridge bridge,
            FolioleCompanionHttpRequest request, String kind, String snapshot) throws Exception {
        String viewId = UUID.nameUUIDFromBytes(
            snapshot.getBytes(StandardCharsets.UTF_8)).toString();
        String requested = query(request.path, "source_view_id");
        if (kind.equals("summary") || kind.equals("global_summary")
                ? requested != null : !viewId.equals(requested)) {
            throw new IllegalArgumentException("sync_identity_source_view_changed");
        }
        JSONObject payload = new JSONObject().put("snapshot_path", snapshot).put("read_kind", kind);
        for (String key : new String[] { "partition", "after_type", "after_id",
                "after_updated_at", "since", "node_id", "section", "after" }) {
            String value = query(request.path, key);
            if (value != null) payload.put(key, key.equals("partition") ? parsePartition(value) : value);
        }
        JSONObject result = bridge.request("read_identity_source", payload);
        return result.put("contract", (kind.startsWith("global_") || kind.startsWith("fact_global_")) ? "global-id-v2" : "global-id-v1")
            .put("source_view_id", viewId)
            .put("partition", payload.opt("partition"));
    }

    private static String kind(String path) {
        if (path.endsWith("identity-global-summary")) return "global_summary";
        if (path.endsWith("identity-global-page")) return "global_page";
        if (path.endsWith("identity-summary")) return "summary";
        if (path.endsWith("identity-page")) return "page";
        if (path.endsWith("identity-fact-summary")) return "fact_global_summary";
        if (path.endsWith("identity-fact-global-page")) return "fact_global_page";
        if (path.endsWith("identity-fact-page")) return "fact_page";
        if (path.endsWith("identity-node-facts")) return "node_facts";
        return "changed_page";
    }

    private static int parsePartition(String value) {
        try { return Integer.parseInt(value); }
        catch (NumberFormatException failure) {
            throw new IllegalArgumentException("sync_identity_request_invalid");
        }
    }

    private static String query(String path, String key) throws Exception {
        String raw = path.contains("?") ? path.substring(path.indexOf('?') + 1) : "";
        for (String item : raw.split("&")) {
            String[] pair = item.split("=", 2);
            if (pair.length == 2 && pair[0].equals(key)) {
                return URLDecoder.decode(pair[1], StandardCharsets.UTF_8.name());
            }
        }
        return null;
    }
}
