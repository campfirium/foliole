package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class FolioleCompanionSyncGroupServer {
    private static final int SYNC_PORT = 38641;
    final Map<String, FolioleCompanionSyncGroupJoinRequest> requests;
    private final Context context;
    private final JSONObject config;
    private final FolioleCompanionSyncGroupDataBridge dataBridge;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ServerSocket server;
    private final FolioleCompanionSyncGroupSnapshot snapshots;
    private volatile boolean running = true;

    FolioleCompanionSyncGroupServer(
        Context context,
        JSONObject config,
        Map<String, FolioleCompanionSyncGroupJoinRequest> requests,
        FolioleCompanionSyncGroupDataBridge dataBridge
    ) throws Exception {
        this.context = context.getApplicationContext(); this.config = config; this.requests = requests; this.dataBridge = dataBridge;
        snapshots = new FolioleCompanionSyncGroupSnapshot(this.context, dataBridge);
        server = new ServerSocket(SYNC_PORT); executor.execute(this::acceptLoop);
    }

    int port() { return server.getLocalPort(); }

    void stop() {
        android.util.Log.i("FolioleSyncProvider", "Stopping provider server on port " + port());
        running = false;
        try { server.close(); } catch (Exception ignored) {}
        executor.shutdownNow();
        snapshots.close();
    }

    private void acceptLoop() {
        while (running) {
            try { Socket socket = server.accept(); executor.execute(() -> handle(socket)); }
            catch (Exception error) { if (running) android.util.Log.w("FolioleSyncProvider", "Accept failed", error); }
        }
    }

    private void handle(Socket socket) {
        try (Socket owned = socket) {
            try {
                FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(owned.getInputStream());
                route(request, owned.getOutputStream(), owned.getInetAddress().getHostAddress());
            } catch (SecurityException error) {
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), 401, new JSONObject().put("error", error.getMessage()));
            } catch (IllegalArgumentException error) {
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), 400, new JSONObject().put("error", error.getMessage()));
            } catch (Exception error) {
                android.util.Log.w("FolioleSyncProvider", "Request failed", error);
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), 500, new JSONObject().put("error", "provider_error"));
            }
        } catch (Exception error) { android.util.Log.w("FolioleSyncProvider", "Response failed", error); }
    }

    private void route(FolioleCompanionHttpRequest request, java.io.OutputStream output, String remoteAddress) throws Exception {
        String pathOnly = request.path.split("\\?", 2)[0];
        if (request.method.equals("GET") && pathOnly.equals("/companion/discovery")) { discovery(output); return; }
        if (request.method.equals("POST") && pathOnly.equals("/companion/pair-requests")) { createRequest(request, output, remoteAddress); return; }
        if (request.method.equals("POST") && pathOnly.equals("/companion/pair")) { completePair(request, output); return; }
        if (request.method.equals("POST") && pathOnly.equals("/companion/sync-group/departure")) {
            departure(request, output); return;
        }
        if (request.method.equals("GET") && pathOnly.equals("/companion/sync-pack")) { syncPack(request, output); return; }
        if (request.method.equals("POST") && pathOnly.equals("/companion/content-blobs")) { contentBlobs(request, output); return; }
        if (request.method.equals("GET") && pathOnly.equals("/companion/content-blob")) { contentBlob(request, output); return; }
        if (request.method.equals("GET") && pathOnly.equals("/companion/attachment-resource")) { attachment(request, output); return; }
        FolioleCompanionHttpResponse.json(output, 404, new JSONObject().put("error", "not_found"));
    }

    private void discovery(java.io.OutputStream output) throws Exception {
        JSONObject group = config.getJSONObject("sync_group");
        FolioleCompanionHttpResponse.json(output, 200, new JSONObject().put("app_version", config.getString("app_version"))
            .put("group_display_name", group.getString("display_name")).put("group_id", group.getString("group_id"))
            .put("group_tag", config.getString("group_tag"))
            .put("timeline_id", group.getString("timeline_id"))
            .put("provider_authorization_id", config.getString("authorization_id"))
            .put("provider_host_name", config.getString("host_name"))
            .put("provider_host_platform", config.getString("host_platform"))
            .put("protocol", protocol()).put("peer_id", config.getString("authorization_id"))
            .put("runtime_instance_id", config.getString("runtime_instance_id"))
            .put("desktop_name", config.getString("host_name"))
            .put("desktop_host_name", config.getString("host_name"))
            .put("desktop_platform", "android-capacitor").put("pairing_mode", "desktop-confirm"));
    }

    private void createRequest(FolioleCompanionHttpRequest request, java.io.OutputStream output, String remoteAddress) throws Exception {
        JSONObject body = new JSONObject(request.bodyText());
        JSONObject group = config.getJSONObject("sync_group");
        JSONObject facts = body.optJSONObject("library_facts");
        if (!group.getString("group_id").equals(body.optString("group_id")) ||
            !config.getString("group_tag").equals(body.optString("group_tag"))) {
            FolioleCompanionHttpResponse.json(output, 409, new JSONObject().put("error", "sync_group_identity_mismatch")); return;
        }
        if (!FolioleCompanionSyncGroupLibraryFacts.valid(facts)) {
            FolioleCompanionHttpResponse.json(output, 409, new JSONObject().put("error", "sync_group_library_facts_invalid")); return;
        }
        if (!FolioleCompanionWorkgroupHttp.compatibleWith(protocol(), body.optJSONObject("protocol"))) {
            FolioleCompanionHttpResponse.json(output, 409, new JSONObject().put("error", "sync_protocol_incompatible")); return;
        }
        FolioleCompanionSyncGroupProvider.pruneExpired(context);
        FolioleCompanionSyncGroupJoinRequest existing = requests.values().stream()
            .filter(item -> !item.status.equals("rejected") && item.matches(body)).findFirst().orElse(null);
        if (existing != null) {
            FolioleCompanionHttpResponse.json(output, 202, existing.publicJson()
                .put("compatibility", FolioleCompanionWorkgroupHttp.compatible(protocol())).put("desktop_protocol", protocol())); return;
        }
        FolioleCompanionSyncGroupJoinRequest pending = new FolioleCompanionSyncGroupJoinRequest(body, normalizeAddress(remoteAddress));
        requests.put(pending.pairRequestId, pending);
        FolioleCompanionHttpResponse.json(output, 202, pending.publicJson()
            .put("compatibility", FolioleCompanionWorkgroupHttp.compatible(protocol())).put("desktop_protocol", protocol()));
    }

    private void completePair(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String id = new JSONObject(request.bodyText()).optString("pair_request_id");
        FolioleCompanionSyncGroupJoinRequest pending = requests.get(id);
        if (pending == null || pending.expired()) { FolioleCompanionHttpResponse.json(output, 404, new JSONObject().put("error", "pair_request_not_found")); return; }
        if (!pending.status.equals("approved")) { FolioleCompanionHttpResponse.json(output, 409, new JSONObject().put("error", "pair_request_pending")); return; }
        FolioleCompanionSyncGroupProvider.assignApprovedProfile(context, dataBridge, config, pending);
        JSONObject group = FolioleCompanionSyncGroupDatabase.groupForApprovedRequest(
            dataBridge, config.getString("host_name"), pending
        );
        FolioleCompanionSyncGroupOutboundPairing.save(
            context, config, pending, dataBridge
        );
        String workgroupKey = FolioleCompanionCurrentGroupCredential.load(
            config.getJSONObject("sync_group").getString("group_id")
        ).workgroupKey;
        FolioleCompanionHttpResponse.json(output, 200, new JSONObject().put("app_version", config.getString("app_version"))
            .put("compatibility", FolioleCompanionWorkgroupHttp.compatible(protocol())).put("desktop_protocol", protocol())
            .put("authorization_id", pending.pairRequestId)
            .put("encrypted_credential_secret", FolioleCompanionSyncGroupPairCrypto.encrypt(pending.pairingPublicKey, workgroupKey))
            .put("provider_encrypted_credential_secret", FolioleCompanionSyncGroupPairCrypto.encrypt(pending.pairingPublicKey, workgroupKey))
            .put("provider_authorization_id", config.getString("authorization_id"))
            .put("host_name", pending.hostName).put("host_platform", pending.hostPlatform)
            .put("provider_host_name", config.getString("host_name"))
            .put("provider_host_platform", config.getString("host_platform"))
            .put("paired_at", java.time.Instant.now().toString()).put("peer_id", config.getString("authorization_id"))
            .put("sync_group", group));
    }

    private void syncPack(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        String peer = authenticate(request);
        int after = integerQuery(request.path, "after_state_seq");
        FolioleCompanionSyncPackProvider.BuildResult pack = snapshots.refresh(
            peer, (snapshot) -> FolioleCompanionSyncPackProvider.build(
                context, snapshot, config.getString("authorization_id"), peer, after));
        FolioleCompanionSyncGroupDatabase.recordSupplyCursor(dataBridge, peer, after, pack.toSeq);
        workgroupBytes(request, output, "application/zip", pack.body);
    }

    private void departure(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String authenticatedAuthorizationId = authenticate(request);
        String authenticatedHostName = FolioleCompanionSyncGroupOutboundPeerStore.hostName(
            context, config.getJSONObject("sync_group").getString("group_id"), authenticatedAuthorizationId);
        JSONObject body = new JSONObject(decryptRequest(request));
        if (authenticatedHostName == null || !authenticatedHostName.equals(body.optString("host_name"))) {
            throw new SecurityException("sync_group_departure_authorization_invalid");
        }
        FolioleCompanionSyncGroupDatabase.recordDeparture(
            dataBridge, config.getJSONObject("sync_group").getString("group_id"), body
        );
        FolioleCompanionSyncGroupPeerStore.remove(context, authenticatedAuthorizationId);
        FolioleCompanionSyncGroupOutboundPeerStore.remove(context, authenticatedAuthorizationId);
        workgroupJson(request, output, new JSONObject().put("status", "accepted"));
    }

    private void contentBlob(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        String peer = authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = snapshots.read(
            peer, (snapshot) -> FolioleCompanionSyncGroupResources.contentBlob(
                snapshot, query(request.path, "hash")));
        if (resource == null) workgroupJson(request, output, 404, new JSONObject().put("error", "blob_not_found"));
        else workgroupBytes(request, output, resource.mimeType, resource.body);
    }

    private void contentBlobs(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        String peer = authenticate(request);
        FolioleCompanionSyncGroupContentBlobBatch.Result batch = snapshots.read(
            peer, (snapshot) -> FolioleCompanionSyncGroupContentBlobBatch.load(
                snapshot, decryptRequest(request)));
        android.util.Log.i("FolioleSyncProvider", "Writing content batch bytes=" + batch.body.length);
        workgroupBytes(request, output, batch.mimeType, batch.body);
        android.util.Log.i("FolioleSyncProvider", "Completed content batch bytes=" + batch.body.length);
    }

    private void attachment(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        String peer = authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = snapshots.read(
            peer, (snapshot) -> FolioleCompanionSyncGroupResources.attachment(
                context, snapshot, query(request.path, "attachment_id"), query(request.path, "content_hash")));
        if (resource == null) workgroupJson(request, output, 404, new JSONObject().put("error", "missing_file"));
        else workgroupBytes(request, output, resource.mimeType, resource.body);
    }

    private JSONObject protocol() throws Exception { return config.getJSONObject("protocol"); }
    private String authenticate(FolioleCompanionHttpRequest request) throws Exception {
        return FolioleCompanionSyncGroupRequestAuth.authenticate(context, request,
            config.getJSONObject("sync_group").getString("group_id"), dataBridge);
    }
    private String decryptRequest(FolioleCompanionHttpRequest request) throws Exception {
        String key = FolioleCompanionCurrentGroupCredential.load(
            config.getJSONObject("sync_group").getString("group_id")
        ).workgroupKey;
        return new String(FolioleCompanionSyncGroupCrypto.decrypt(
            key, config.getString("group_tag"), request.method, request.path, "request",
            "application/json; charset=utf-8", new JSONObject(request.bodyText())
        ), StandardCharsets.UTF_8);
    }
    private void workgroupJson(FolioleCompanionHttpRequest request, java.io.OutputStream output, JSONObject body) throws Exception {
        FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output, 200, body);
    }
    private void workgroupJson(
        FolioleCompanionHttpRequest request, java.io.OutputStream output, int status, JSONObject body
    ) throws Exception {
        FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output, status, body);
    }
    private void workgroupBytes(FolioleCompanionHttpRequest request, java.io.OutputStream output, String contentType, byte[] body) throws Exception {
        FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output, 200, contentType, body);
    }
    private static int integerQuery(String path, String key) throws Exception { String value = query(path, key); return value == null ? 0 : Integer.parseInt(value); }
    private static String query(String path, String key) throws Exception { String query = path.contains("?") ? path.substring(path.indexOf('?') + 1) : ""; for (String item : query.split("&")) { String[] pair = item.split("=", 2); if (pair.length == 2 && pair[0].equals(key)) return URLDecoder.decode(pair[1], "UTF-8"); } return null; }
    private static String normalizeAddress(String value) { return value.startsWith("::ffff:") ? value.substring(7) : value; }
}
