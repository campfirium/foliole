package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.URLDecoder;

final class FolioleCompanionSyncPackRoutes {
    private FolioleCompanionSyncPackRoutes() {}

    static void pack(Context context, JSONObject config, FolioleCompanionSyncGroupDataBridge bridge,
                     FolioleCompanionSyncGroupSnapshot snapshots, FolioleCompanionHttpRequest request,
                     OutputStream output, String peer) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        if (!"bounded-v1".equals(query(request.path, "page_contract"))) {
            error(context, config, request, output, "sync_pack_page_contract_required");
            return;
        }
        int after = integerQuery(request.path, "after_state_seq");
        Integer frontier = optionalInteger(request.path, "frontier_state_seq");
        String epoch = query(request.path, "source_epoch");
        if ((frontier == null) != (epoch == null)) throw new IllegalArgumentException("invalid_sync_pack_page_request");
        String indexId = query(request.path, "fact_index_id");
        Integer selectedTo = optionalInteger(request.path, "to_state_seq");
        if (indexId == null || indexId.isEmpty()) {
            error(context, config, request, output, "sync_pack_fact_probe_required");
            return;
        }
        if (indexId != null && selectedTo == null) throw new IllegalArgumentException("invalid_sync_pack_fact_request");
        FolioleCompanionSyncGroupSnapshot.Work<FolioleCompanionSyncPackProvider.BuildResult> build = snapshot ->
            FolioleCompanionSyncPackProvider.build(context, snapshot,
                config.getString("device_id"), peer, after, frontier, epoch,
                selectedTo, indexId, query(request.path, "have_v"),
                query(request.path, "have_p"), query(request.path, "have_r"));
        FolioleCompanionSyncPackProvider.BuildResult pack;
        try {
            pack = frontier == null ? snapshots.refresh(peer, build)
                : snapshots.continueOrRefresh(peer, build);
        } catch (IllegalArgumentException failure) {
            if (failure.getMessage() != null && failure.getMessage().startsWith("sync_pack_fact_")) {
                error(context, config, request, output, failure.getMessage());
                return;
            }
            throw failure;
        }
        bridge.request("stage_version_pack", pack.holds);
        FolioleCompanionSyncGroupDatabase.recordSupplyCursor(bridge, peer, after, pack.toSeq);
        FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output,
            200, "application/zip", pack.body);
    }

    static void facts(Context context, JSONObject config, FolioleCompanionSyncGroupSnapshot snapshots,
                      FolioleCompanionHttpRequest request, OutputStream output, String peer) throws Exception {
        if (!"bounded-v1".equals(query(request.path, "page_contract"))) {
            error(context, config, request, output, "sync_pack_page_contract_required");
            return;
        }
        int after = integerQuery(request.path, "after_state_seq");
        Integer frontier = optionalInteger(request.path, "frontier_state_seq");
        String epoch = query(request.path, "source_epoch");
        if ((frontier == null) != (epoch == null)) throw new IllegalArgumentException("invalid_sync_pack_fact_request");
        FolioleCompanionSyncGroupSnapshot.Work<JSONObject> build = snapshot ->
            FolioleCompanionSyncPackFactProvider.index(context, snapshot, after, frontier, epoch);
        JSONObject index = frontier == null ? snapshots.refresh(peer, build)
            : snapshots.continueOrRefresh(peer, build);
        FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output, 200, index);
    }

    private static void error(Context context, JSONObject config, FolioleCompanionHttpRequest request,
                              OutputStream output, String code) throws Exception {
        FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output,
            409, new JSONObject().put("error", code));
    }

    private static int integerQuery(String path, String key) throws Exception {
        Integer value = optionalInteger(path, key);
        return value == null ? 0 : value;
    }

    private static Integer optionalInteger(String path, String key) throws Exception {
        String value = query(path, key);
        if (value == null) return null;
        try { return Integer.valueOf(value); }
        catch (NumberFormatException ignored) { throw new IllegalArgumentException("invalid_sync_pack_page_request"); }
    }

    private static String query(String path, String key) throws Exception {
        String query = path.contains("?") ? path.substring(path.indexOf('?') + 1) : "";
        for (String item : query.split("&")) {
            String[] pair = item.split("=", 2);
            if (pair.length == 2 && pair[0].equals(key)) return URLDecoder.decode(pair[1], "UTF-8");
        }
        return null;
    }
}
