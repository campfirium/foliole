package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.foliole.android.framed.FramedSyncSessionNonceSQLite;
import com.foliole.android.framed.FramedSyncTransferSQLite;

final class FolioleCompanionSyncGroupServer {
    private static final int SYNC_PORT = BuildConfig.FOLIOLE_COMPANION_SYNC_PORT;
    private final Context context;
    private final JSONObject config;
    private final FolioleCompanionSyncGroupDataBridge dataBridge;
    private final FolioleCompanionSyncGroupSessionAuth auth;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final FolioleCompanionJoinRequestProvider joins;
    private final ServerSocket server;
    private final FolioleCompanionSyncGroupSnapshot snapshots;
    private final FramedSyncSessionNonceSQLite framedSyncNonces;
    private final FramedSyncTransferSQLite framedSyncTransfers;
    private final Runnable stateChanged;
    private volatile boolean running = true;

    FolioleCompanionSyncGroupServer(
        Context context, JSONObject config, FolioleCompanionJoinRequestProvider joins,
        FolioleCompanionSyncGroupDataBridge dataBridge, Runnable stateChanged
    ) throws Exception {
        this.context = context.getApplicationContext(); this.config = config;
        this.joins = joins; this.dataBridge = dataBridge; this.stateChanged = stateChanged;
        auth = new FolioleCompanionSyncGroupSessionAuth(this.context,
            config.getJSONObject("sync_group").getString("group_id"), dataBridge);
        snapshots = new FolioleCompanionSyncGroupSnapshot(this.context, dataBridge);
        framedSyncNonces = new FramedSyncSessionNonceSQLite(this.context);
        framedSyncTransfers = new FramedSyncTransferSQLite(this.context);
        server = new ServerSocket(SYNC_PORT); executor.execute(this::acceptLoop);
    }

    int port() { return server.getLocalPort(); }

    void stop() {
        running = false;
        try { server.close(); } catch (Exception ignored) {}
        executor.shutdownNow(); snapshots.close(); framedSyncNonces.close(); framedSyncTransfers.close();
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
                route(request, owned.getOutputStream());
            } catch (SecurityException error) {
                int status = "sync_group_member_state_required".equals(error.getMessage()) ? 409 : 401;
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), status, error(error.getMessage()));
            } catch (IllegalArgumentException error) {
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), 400, error(error.getMessage()));
            } catch (Exception error) {
                android.util.Log.w("FolioleSyncProvider", "Request failed", error);
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), 500, error("provider_error"));
            }
        } catch (Exception error) { android.util.Log.w("FolioleSyncProvider", "Response failed", error); }
    }

    private void route(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String path = request.path.split("\\?", 2)[0];
        if (request.method.equals("GET") && path.equals("/companion/discovery")) discovery(output);
        else if (request.method.equals("POST") && path.equals("/sync-group/join-requests")) createJoin(request, output);
        else if (request.method.equals("POST") && path.equals("/sync-group/join-acceptance")) collectAcceptance(request, output);
        else if (request.method.equals("POST") && path.equals("/sync-group/member-state")) memberState(request, output);
        else if (request.method.equals("GET") && FolioleCompanionSyncIdentityRoutes.supports(path))
            FolioleCompanionSyncIdentityRoutes.handle(context, config, dataBridge, snapshots,
                request, output, auth.authenticate(request));
        else if (request.method.equals("POST") && path.equals("/companion/sync-identity-pack"))
            FolioleCompanionSyncIdentityRoutes.pack(context, config, dataBridge, snapshots,
                request, output, auth.authenticate(request), new JSONObject(decryptRequest(request)));
        else if (request.method.equals("POST") && path.equals("/companion/sync-identity-push"))
            FolioleCompanionSyncIdentityPushRoute.handle(context, config, dataBridge,
                request, output, auth.authenticate(request), new JSONObject(decryptRequest(request)));
        else if (request.method.equals("POST") && path.equals("/companion/framed-sync"))
            FolioleCompanionFramedSyncRoute.handle(config, dataBridge,
                request, output, auth.authenticate(request), framedSyncNonces, framedSyncTransfers);
        else if (request.method.equals("GET") && path.equals("/companion/sync-pack"))
            FolioleCompanionSyncPackRoutes.pack(context, config, dataBridge, snapshots,
                request, output, auth.authenticate(request));
        else if (request.method.equals("GET") && path.equals("/companion/sync-pack-facts"))
            FolioleCompanionSyncPackRoutes.facts(context, config, snapshots,
                request, output, auth.authenticate(request));
        else if (request.method.equals("POST") && path.equals("/companion/version-pack-receipt"))
            versionPackReceipt(request, output);
        else if (request.method.equals("POST") && path.equals("/companion/resource-availability")) availability(request, output);
        else if (request.method.equals("POST") && path.equals("/companion/content-blobs")) contentBlobs(request, output);
        else if (request.method.equals("GET") && path.equals("/companion/content-blob")) contentBlob(request, output);
        else if (request.method.equals("GET") && path.equals("/companion/attachment-resource")) attachment(request, output);
        else FolioleCompanionHttpResponse.json(output, 404, error("not_found"));
    }

    private void discovery(java.io.OutputStream output) throws Exception {
        JSONObject group = config.getJSONObject("sync_group");
        FolioleCompanionHttpResponse.json(output, 200, new JSONObject()
            .put("app_version", config.getString("app_version"))
            .put("group_display_name", group.getString("display_name"))
            .put("group_id", group.getString("group_id"))
            .put("group_tag", config.getString("group_tag"))
            .put("protocol", config.getJSONObject("protocol"))
            .put("provider_device_id", config.getString("device_id"))
            .put("provider_device_name", config.getString("device_name"))
            .put("provider_platform", config.getString("platform"))
            .put("topology_role", config.getString("topology_role"))
            .put("runtime_instance_id", config.getString("runtime_instance_id")));
    }

    private void createJoin(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        JSONObject input = new JSONObject(request.bodyText());
        try { dataBridge.request("validate_join", input); }
        catch (IllegalStateException failure) {
            if (!"sync_group_merge_requires_overwrite".equals(failure.getMessage())) throw failure;
            FolioleCompanionHttpResponse.json(output, 409, error(failure.getMessage()));
            return;
        }
        JSONObject result = joins.receive(input, System.currentTimeMillis());
        stateChanged.run();
        FolioleCompanionHttpResponse.json(output, 202, result);
    }

    private void collectAcceptance(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String requestId = new JSONObject(request.bodyText()).optString("request_id");
        JSONObject result = joins.collect(requestId, System.currentTimeMillis());
        if (result == null) FolioleCompanionHttpResponse.json(output, 409, error("sync_group_join_request_pending"));
        else FolioleCompanionHttpResponse.json(output, 200, result);
    }

    private void versionPackReceipt(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = auth.authenticate(request);
        try {
            JSONObject receipt = new JSONObject(decryptRequest(request));
            JSONObject result = dataBridge.request("confirm_version_pack", new JSONObject()
                .put("authenticated_device_id", peer).put("receipt", receipt));
            workgroupJson(request, output, 200, result);
        } catch (Exception error) {
            workgroupJson(request, output, 409, error(error.getMessage()));
        }
    }

    private void memberState(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = auth.authenticate(request, true);
        JSONObject incoming = new JSONObject(decryptRequest(request));
        JSONObject applied = dataBridge.request("apply_member_state", new JSONObject()
            .put("authenticated_device_id", peer).put("state", incoming));
        auth.update(peer, applied);
        workgroupJson(request, output, 200, applied.getJSONObject("state"));
        stateChanged.run();
    }

    private void contentBlob(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = auth.authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = snapshots.read(
            peer, snapshot -> FolioleCompanionSyncGroupResources.contentBlob(snapshot, query(request.path, "hash")));
        if (resource == null) workgroupJson(request, output, 404, error("blob_not_found"));
        else workgroupBytes(request, output, resource.mimeType, resource.body);
    }

    private void availability(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = auth.authenticate(request);
        String body = decryptRequest(request);
        try {
            JSONObject result = snapshots.refresh(peer, snapshot -> FolioleCompanionResourceAvailability.reply(
                context, snapshot, body, config.getString("device_id")));
            workgroupJson(request, output, 200, result);
        } catch (Exception error) {
            workgroupJson(request, output, 400, error(error.getMessage()));
        }
    }

    private void contentBlobs(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = auth.authenticate(request);
        FolioleCompanionSyncGroupContentBlobBatch.Result batch = snapshots.read(
            peer, snapshot -> FolioleCompanionSyncGroupContentBlobBatch.load(snapshot, decryptRequest(request)));
        workgroupBytes(request, output, batch.mimeType, batch.body);
    }

    private void attachment(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = auth.authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = snapshots.read(
            peer, snapshot -> FolioleCompanionSyncGroupResources.attachmentRange(
                context, query(request.path, "attachment_id"), query(request.path, "content_hash"), query(request.path, "storage_key"),
                query(request.path, "offset"), query(request.path, "length")));
        if (resource == null) workgroupJson(request, output, 404, error("missing_file"));
        else FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output,
            200, resource.mimeType, resource.body, resource.totalBytes);
    }

    private String decryptRequest(FolioleCompanionHttpRequest request) throws Exception {
        String key = FolioleCompanionCurrentGroupCredential.load(
            config.getJSONObject("sync_group").getString("group_id")).workgroupKey;
        return new String(FolioleCompanionSyncGroupCrypto.decrypt(
            key, config.getString("group_tag"), request.method, request.path, "request",
            "application/json; charset=utf-8", new JSONObject(request.bodyText())), StandardCharsets.UTF_8);
    }

    private void workgroupJson(FolioleCompanionHttpRequest request, java.io.OutputStream output,
                               int status, JSONObject body) throws Exception {
        FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output, status, body);
    }

    private void workgroupBytes(FolioleCompanionHttpRequest request, java.io.OutputStream output,
                                String contentType, byte[] body) throws Exception {
        FolioleCompanionWorkgroupHttp.writeBytes(context, config, request, output, 200, contentType, body);
    }

    private static JSONObject error(String value) throws Exception { return new JSONObject().put("error", value); }
    private static int integerQuery(String path, String key) throws Exception {
        String value = query(path, key); return value == null ? 0 : Integer.parseInt(value);
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
