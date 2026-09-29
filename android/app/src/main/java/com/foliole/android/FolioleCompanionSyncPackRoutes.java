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
        String dependencyView = query(request.path, "dependency_view");
        if (dependencyView != null) {
            dependencyPack(context, config, bridge, snapshots, request, output, peer,
                after, frontier, epoch, dependencyView);
            return;
        }
        String factView = query(request.path, "fact_view");
        if (factView != null) {
            pagedFactPack(context, config, bridge, snapshots, request, output, peer,
                after, frontier, epoch, factView);
            return;
        }
        if (indexId == null || indexId.isEmpty()) {
            error(context, config, request, output, "sync_pack_fact_probe_required");
            return;
        }
        if (indexId != null && selectedTo == null) throw new IllegalArgumentException("invalid_sync_pack_fact_request");
        FolioleCompanionSyncGroupSnapshot.Work<FolioleCompanionSyncPackProvider.BuildResult> build = snapshot -> {
            try {
                return FolioleCompanionSyncPackProvider.build(context, snapshot,
                    config.getString("device_id"), peer, after, frontier, epoch,
                    selectedTo, indexId, query(request.path, "have_v"),
                    query(request.path, "have_p"), query(request.path, "have_r"));
            } catch (IllegalArgumentException failure) {
                if (!"sync_pack_object_requires_fragments".equals(failure.getMessage())) throw failure;
                JSONObject index = FolioleCompanionSyncPackFactProvider.index(context, snapshot,
                    after, frontier, epoch);
                if (!indexId.equals(index.getString("index_id")) || selectedTo != index.getInt("to_state_seq")) {
                    throw new IllegalArgumentException("sync_pack_fact_index_changed");
                }
                FolioleCompanionSyncPackDependencySource.Session session =
                    FolioleCompanionSyncPackDependencySource.start(snapshot, peer,
                        config.getJSONObject("sync_group").getString("group_id"),
                        config.getString("device_id"), after, selectedTo, frontier, epoch,
                        index, query(request.path, "have_v"), query(request.path, "have_p"),
                        query(request.path, "have_r"));
                JSONObject page = session.page(0, session.initialDigest());
                return new FolioleCompanionSyncPackProvider.BuildResult(
                    FolioleCompanionSyncPackDependencyArchive.build(context, page,
                        config.getString("device_id"), peer), after, new JSONObject());
            }
        };
        FolioleCompanionSyncPackProvider.BuildResult pack;
        try {
            pack = frontier == null ? snapshots.refresh(peer, build)
                : snapshots.read(peer, build);
        } catch (IllegalArgumentException failure) {
            if (failure.getMessage() != null && failure.getMessage().startsWith("sync_pack_fact_")) {
                error(context, config, request, output, failure.getMessage());
                return;
            }
            throw failure;
        } catch (IllegalStateException failure) {
            if ("sync_group_snapshot_missing".equals(failure.getMessage())) {
                error(context, config, request, output, "sync_pack_source_view_unavailable");
                return;
            }
            throw failure;
        }
        if (pack.toSeq > after) {
            bridge.request("stage_version_pack", pack.holds);
            FolioleCompanionSyncGroupDatabase.recordSupplyCursor(bridge, peer, after, pack.toSeq);
        }
        FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output,
            200, "application/zip", pack.body);
    }

    private static void pagedFactPack(Context context, JSONObject config,
            FolioleCompanionSyncGroupDataBridge bridge, FolioleCompanionSyncGroupSnapshot snapshots,
            FolioleCompanionHttpRequest request, OutputStream output, String peer,
            int after, Integer frontier, String epoch, String viewId) throws Exception {
        try {
            FolioleCompanionSyncPackFactPages.Session fact =
                FolioleCompanionSyncPackFactPages.open(peer, viewId);
            if (!fact.ready || after != fact.from || frontier == null || frontier != fact.frontier ||
                    !fact.epoch.equals(epoch)) {
                throw new IllegalArgumentException("sync_pack_fact_claims_incomplete");
            }
            FolioleCompanionSyncPackProvider.BuildResult pack = snapshots.read(peer, snapshot -> {
                if (!snapshot.equals(fact.snapshotPath)) {
                    throw new IllegalArgumentException("sync_pack_source_view_changed");
                }
                FolioleCompanionSyncPackDependencySource.Session session =
                    FolioleCompanionSyncPackDependencySource.startPaged(snapshot, peer,
                        config.getJSONObject("sync_group").getString("group_id"),
                        config.getString("device_id"), fact);
                if (session.expectedRows == 0) return FolioleCompanionSyncPackProvider.buildKnown(
                    context, snapshot, config.getString("device_id"), peer,
                    fact.from, fact.to, fact.frontier, fact.epoch, session.transfer);
                JSONObject page = session.page(0, session.initialDigest());
                return new FolioleCompanionSyncPackProvider.BuildResult(
                    FolioleCompanionSyncPackDependencyArchive.build(context, page,
                        config.getString("device_id"), peer), after, new JSONObject());
            });
            if (pack.toSeq > after) {
                bridge.request("stage_version_pack", pack.holds);
                FolioleCompanionSyncGroupDatabase.recordSupplyCursor(bridge, peer, after, pack.toSeq);
            }
            FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output,
                200, "application/zip", pack.body);
        } catch (IllegalArgumentException | IllegalStateException failure) {
            String code = failure.getMessage();
            if ("sync_group_snapshot_missing".equals(code)) code = "sync_pack_source_view_unavailable";
            if (code != null && code.startsWith("sync_pack_")) {
                error(context, config, request, output, code);
                return;
            }
            throw failure;
        }
    }

    private static void dependencyPack(Context context, JSONObject config,
            FolioleCompanionSyncGroupDataBridge bridge, FolioleCompanionSyncGroupSnapshot snapshots,
            FolioleCompanionHttpRequest request, OutputStream output, String peer,
            int after, Integer frontier, String epoch, String viewId) throws Exception {
        try {
            FolioleCompanionSyncPackDependencySource.Session session =
                FolioleCompanionSyncPackDependencySource.open(peer, viewId);
            if (after != session.from || frontier == null || frontier != session.frontier ||
                    !session.epoch.equals(epoch)) {
                throw new IllegalArgumentException("sync_pack_source_view_changed");
            }
            int afterRow = integerQuery(request.path, "dependency_after_row");
            String digest = query(request.path, "dependency_digest");
            if (digest == null) digest = session.initialDigest();
            String requestedDigest = digest;
            FolioleCompanionSyncPackProvider.BuildResult pack = snapshots.read(peer, snapshot -> {
                if (!snapshot.equals(session.snapshotPath)) {
                    throw new IllegalArgumentException("sync_pack_source_view_changed");
                }
                JSONObject page = session.page(afterRow, requestedDigest);
                if (page != null) return new FolioleCompanionSyncPackProvider.BuildResult(
                    FolioleCompanionSyncPackDependencyArchive.build(context, page,
                        config.getString("device_id"), peer), after, new JSONObject());
                session.assertFinal(afterRow, requestedDigest);
                return FolioleCompanionSyncPackProvider.build(context, snapshot,
                    config.getString("device_id"), peer, after, frontier, epoch, session.to,
                    session.index == null ? null : session.index.getString("index_id"), session.versionBits,
                    session.parentBits, session.reviewBits, session.transfer);
            });
            if (pack.toSeq > after) {
                bridge.request("stage_version_pack", pack.holds);
                FolioleCompanionSyncGroupDatabase.recordSupplyCursor(bridge, peer, after, pack.toSeq);
            }
            FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output,
                200, "application/zip", pack.body);
        } catch (IllegalArgumentException | IllegalStateException failure) {
            String code = failure.getMessage();
            if ("sync_group_snapshot_missing".equals(code)) code = "sync_pack_source_view_unavailable";
            if (code != null && code.startsWith("sync_pack_")) {
                error(context, config, request, output, code);
                return;
            }
            throw failure;
        }
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
        String factView = query(request.path, "fact_view");
        FolioleCompanionSyncGroupSnapshot.Work<JSONObject> build = snapshot -> {
            if (factView != null) {
                FolioleCompanionSyncPackFactPages.Session session =
                    FolioleCompanionSyncPackFactPages.open(peer, factView);
                if (!snapshot.equals(session.snapshotPath) || after != session.from ||
                        frontier == null || frontier != session.frontier || !session.epoch.equals(epoch)) {
                    throw new IllegalArgumentException("sync_pack_source_view_changed");
                }
                return session.read(query(request.path, "fact_index_id"),
                    query(request.path, "have_v"), query(request.path, "have_p"),
                    query(request.path, "have_r"));
            }
            try { return FolioleCompanionSyncPackFactProvider.index(context, snapshot,
                after, frontier, epoch); }
            catch (IllegalArgumentException failure) {
                if (!"sync_pack_fact_index_over_budget".equals(failure.getMessage())) throw failure;
                return FolioleCompanionSyncPackFactPages.start(context, snapshot, peer,
                    after, frontier, epoch).read(null, null, null, null);
            }
        };
        JSONObject index;
        try {
            index = factView == null && frontier == null ? snapshots.refresh(peer, build)
                : snapshots.read(peer, build);
        } catch (IllegalStateException failure) {
            if ("sync_group_snapshot_missing".equals(failure.getMessage())) {
                error(context, config, request, output, "sync_pack_source_view_unavailable");
                return;
            }
            throw failure;
        }
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
