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
    final Map<String, FolioleCompanionSyncGroupJoinRequest> requests;
    private final Context context;
    private final JSONObject config;
    private final FolioleCompanionSyncGroupDataBridge dataBridge;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ServerSocket server;
    private volatile boolean running = true;

    FolioleCompanionSyncGroupServer(
        Context context,
        JSONObject config,
        Map<String, FolioleCompanionSyncGroupJoinRequest> requests,
        FolioleCompanionSyncGroupDataBridge dataBridge
    ) throws Exception {
        this.context = context.getApplicationContext(); this.config = config; this.requests = requests; this.dataBridge = dataBridge;
        server = new ServerSocket(0); executor.execute(this::acceptLoop);
    }

    int port() { return server.getLocalPort(); }

    void stop() {
        running = false;
        try { server.close(); } catch (Exception ignored) {}
        executor.shutdownNow();
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
            .put("timeline_id", group.getString("timeline_id")).put("provider_device_id", config.getString("device_id"))
            .put("provider_device_kind", "android-capacitor").put("provider_device_name", config.getString("device_name"))
            .put("protocol", protocol()).put("peer_id", config.getString("device_id"))
            .put("desktop_name", config.getString("device_name")).put("desktop_device_name", config.getString("device_name"))
            .put("desktop_platform", "android-capacitor").put("pairing_mode", "desktop-confirm"));
    }

    private void createRequest(FolioleCompanionHttpRequest request, java.io.OutputStream output, String remoteAddress) throws Exception {
        JSONObject body = new JSONObject(request.bodyText());
        JSONObject group = config.getJSONObject("sync_group");
        boolean existingMember = FolioleCompanionSyncGroupDatabase.isAuthorizedMember(
            dataBridge, group.getString("group_id"), body.optString("device_id")
        );
        if (!group.getString("group_id").equals(body.optString("group_id")) ||
            !group.getString("timeline_id").equals(body.optString("timeline_id")) ||
            (!existingMember && !empty(body.optJSONObject("library_facts")))) {
            FolioleCompanionHttpResponse.json(output, 409, new JSONObject().put("error", "sync_group_requires_empty_library")); return;
        }
        if (!compatibleWith(body.optJSONObject("protocol"))) {
            FolioleCompanionHttpResponse.json(output, 409, new JSONObject().put("error", "sync_protocol_incompatible")); return;
        }
        FolioleCompanionSyncGroupProvider.pruneExpired(context);
        FolioleCompanionSyncGroupJoinRequest existing = requests.values().stream()
            .filter(item -> !item.status.equals("rejected") && item.matches(body)).findFirst().orElse(null);
        if (existing != null) {
            FolioleCompanionHttpResponse.json(output, 202, existing.publicJson()
                .put("compatibility", compatible()).put("desktop_protocol", protocol())); return;
        }
        FolioleCompanionSyncGroupJoinRequest pending = new FolioleCompanionSyncGroupJoinRequest(body, normalizeAddress(remoteAddress));
        requests.put(pending.pairRequestId, pending);
        FolioleCompanionHttpResponse.json(output, 202, pending.publicJson()
            .put("compatibility", compatible()).put("desktop_protocol", protocol()));
    }

    private void completePair(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String id = new JSONObject(request.bodyText()).optString("pair_request_id");
        FolioleCompanionSyncGroupJoinRequest pending = requests.get(id);
        if (pending == null || pending.expired()) { FolioleCompanionHttpResponse.json(output, 404, new JSONObject().put("error", "pair_request_not_found")); return; }
        if (!pending.status.equals("approved")) { FolioleCompanionHttpResponse.json(output, 409, new JSONObject().put("error", "pair_request_pending")); return; }
        JSONObject group = FolioleCompanionSyncGroupDatabase.groupForApprovedRequest(
            dataBridge, config.getString("device_id"), pending
        );
        saveOutboundPairing(pending, pending.providerSecret);
        FolioleCompanionHttpResponse.json(output, 200, new JSONObject().put("app_version", config.getString("app_version"))
            .put("compatibility", compatible()).put("desktop_protocol", protocol()).put("device_id", pending.deviceId)
            .put("encrypted_device_secret", FolioleCompanionSyncGroupPairCrypto.encrypt(pending.pairingPublicKey, pending.deviceSecret))
            .put("provider_encrypted_device_secret", FolioleCompanionSyncGroupPairCrypto.encrypt(pending.pairingPublicKey, pending.providerSecret))
            .put("provider_device_id", config.getString("device_id")).put("provider_device_kind", "android-capacitor")
            .put("provider_device_name", config.getString("device_name"))
            .put("paired_at", java.time.Instant.now().toString()).put("peer_id", config.getString("device_id"))
            .put("sync_group", group));
    }

    private void saveOutboundPairing(FolioleCompanionSyncGroupJoinRequest pending, String secret) throws Exception {
        String now = java.time.Instant.now().toString();
        FolioleCompanionSyncGroupOutboundPeerStore.save(
            context, config.getJSONObject("sync_group").getString("group_id"), config.getString("device_id"),
            pending.deviceId, "http://" + pending.remoteAddress + ":38641", secret);
        FolioleCompanionSyncGroupDatabase.saveSyncEndpoint(
            dataBridge, "http://" + pending.remoteAddress + ":38641", now);
    }

    private void syncPack(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        String peer = authenticate(request);
        int after = integerQuery(request.path, "after_state_seq");
        FolioleCompanionSyncPackProvider.BuildResult pack = FolioleCompanionSyncGroupSnapshot.read(
            context, dataBridge, (snapshot) -> FolioleCompanionSyncPackProvider.build(
                context, snapshot, config.getString("device_id"), peer, after));
        FolioleCompanionSyncGroupDatabase.recordSupplyCursor(dataBridge, peer, after, pack.toSeq);
        FolioleCompanionHttpResponse.bytes(output, 200, "application/zip", pack.body);
    }

    private void departure(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String authenticatedDeviceId = authenticate(request);
        JSONObject body = new JSONObject(request.bodyText());
        if (!authenticatedDeviceId.equals(body.optString("device_id"))) {
            throw new SecurityException("sync_group_departure_authorization_invalid");
        }
        FolioleCompanionSyncGroupDatabase.recordDeparture(
            dataBridge, config.getJSONObject("sync_group").getString("group_id"), body
        );
        FolioleCompanionSyncGroupPeerStore.remove(context, authenticatedDeviceId);
        FolioleCompanionSyncGroupOutboundPeerStore.remove(context, authenticatedDeviceId);
        FolioleCompanionHttpResponse.json(output, 200, new JSONObject().put("status", "accepted"));
    }

    private void contentBlob(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = FolioleCompanionSyncGroupSnapshot.read(
            context, dataBridge, (snapshot) -> FolioleCompanionSyncGroupResources.contentBlob(
                snapshot, query(request.path, "hash")));
        if (resource == null) FolioleCompanionHttpResponse.json(output, 404, new JSONObject().put("error", "blob_not_found"));
        else FolioleCompanionHttpResponse.bytes(output, 200, resource.mimeType, resource.body);
    }

    private void contentBlobs(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        authenticate(request);
        FolioleCompanionSyncGroupContentBlobBatch.Result batch = FolioleCompanionSyncGroupSnapshot.read(
            context, dataBridge, (snapshot) -> FolioleCompanionSyncGroupContentBlobBatch.load(
                snapshot, request.bodyText()));
        FolioleCompanionHttpResponse.bytes(output, 200, batch.mimeType, batch.body);
    }

    private void attachment(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = FolioleCompanionSyncGroupSnapshot.read(
            context, dataBridge, (snapshot) -> FolioleCompanionSyncGroupResources.attachment(
                context, snapshot, query(request.path, "attachment_id"), query(request.path, "content_hash")));
        if (resource == null) FolioleCompanionHttpResponse.json(output, 404, new JSONObject().put("error", "missing_file"));
        else FolioleCompanionHttpResponse.bytes(output, 200, resource.mimeType, resource.body);
    }

    private static boolean empty(JSONObject facts) { return facts != null && facts.optInt("node_count", -1) == 0 && facts.optInt("review_log_count", -1) == 0 && facts.optInt("attachment_count", -1) == 0 && facts.optInt("content_blob_count", -1) == 0 && facts.isNull("timeline_id"); }
    private JSONObject protocol() throws Exception { return config.getJSONObject("protocol"); }
    private String authenticate(FolioleCompanionHttpRequest request) throws Exception {
        return FolioleCompanionSyncGroupRequestAuth.authenticate(context, request,
            config.getJSONObject("sync_group").getString("group_id"), dataBridge);
    }
    private JSONObject compatible() throws Exception { return new JSONObject().put("status", "compatible").put("reason", JSONObject.NULL)
        .put("missing_capabilities", new org.json.JSONArray()).put("negotiated_version", protocol().getInt("version")); }
    private boolean compatibleWith(JSONObject remote) throws Exception {
        if (remote == null) return false;
        int localVersion = protocol().getInt("version");
        if (localVersion < remote.optInt("min_supported_version", Integer.MAX_VALUE) ||
            localVersion > remote.optInt("max_supported_version", Integer.MIN_VALUE)) return false;
        org.json.JSONArray required = protocol().getJSONArray("capabilities");
        org.json.JSONArray offered = remote.optJSONArray("capabilities");
        if (offered == null) return false;
        for (int index = 0; index < required.length(); index++) {
            boolean found = false;
            for (int other = 0; other < offered.length(); other++) found |= required.getString(index).equals(offered.getString(other));
            if (!found) return false;
        }
        return true;
    }
    private static int integerQuery(String path, String key) throws Exception { String value = query(path, key); return value == null ? 0 : Integer.parseInt(value); }
    private static String query(String path, String key) throws Exception { String query = path.contains("?") ? path.substring(path.indexOf('?') + 1) : ""; for (String item : query.split("&")) { String[] pair = item.split("=", 2); if (pair.length == 2 && pair[0].equals(key)) return URLDecoder.decode(pair[1], "UTF-8"); } return null; }
    private static String normalizeAddress(String value) { return value.startsWith("::ffff:") ? value.substring(7) : value; }
}
