package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class FolioleCompanionSyncGroupServer {
    private static final int SYNC_PORT = 38641;
    private final Context context;
    private final JSONObject config;
    private final FolioleCompanionSyncGroupDataBridge dataBridge;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final FolioleCompanionJoinRequestProvider joins;
    private final ServerSocket server;
    private final FolioleCompanionSyncGroupSnapshot snapshots;
    private volatile boolean running = true;

    FolioleCompanionSyncGroupServer(
        Context context, JSONObject config, FolioleCompanionJoinRequestProvider joins,
        FolioleCompanionSyncGroupDataBridge dataBridge
    ) throws Exception {
        this.context = context.getApplicationContext(); this.config = config;
        this.joins = joins; this.dataBridge = dataBridge;
        snapshots = new FolioleCompanionSyncGroupSnapshot(this.context, dataBridge);
        server = new ServerSocket(SYNC_PORT); executor.execute(this::acceptLoop);
    }

    int port() { return server.getLocalPort(); }

    void stop() {
        running = false;
        try { server.close(); } catch (Exception ignored) {}
        executor.shutdownNow(); snapshots.close();
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
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), 401, error(error.getMessage()));
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
        else if (request.method.equals("GET") && path.equals("/companion/sync-pack")) syncPack(request, output);
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
            .put("runtime_instance_id", config.getString("runtime_instance_id")));
    }

    private void createJoin(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        JSONObject result = joins.receive(new JSONObject(request.bodyText()), System.currentTimeMillis());
        FolioleCompanionSyncGroupProvider.state();
        FolioleCompanionHttpResponse.json(output, 202, result);
    }

    private void collectAcceptance(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String requestId = new JSONObject(request.bodyText()).optString("request_id");
        JSONObject result = joins.collect(requestId, System.currentTimeMillis());
        if (result == null) FolioleCompanionHttpResponse.json(output, 409, error("sync_group_join_request_pending"));
        else FolioleCompanionHttpResponse.json(output, 200, result);
    }

    private void syncPack(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        FolioleCompanionSyncScreenAwake.touch();
        String peer = authenticate(request);
        int after = integerQuery(request.path, "after_state_seq");
        FolioleCompanionSyncPackProvider.BuildResult pack = snapshots.refresh(
            peer, snapshot -> FolioleCompanionSyncPackProvider.build(
                context, snapshot, config.getString("device_id"), peer, after));
        FolioleCompanionSyncGroupDatabase.recordSupplyCursor(dataBridge, peer, after, pack.toSeq);
        workgroupBytes(request, output, "application/zip", pack.body);
    }

    private void contentBlob(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = snapshots.read(
            peer, snapshot -> FolioleCompanionSyncGroupResources.contentBlob(snapshot, query(request.path, "hash")));
        if (resource == null) workgroupJson(request, output, 404, error("blob_not_found"));
        else workgroupBytes(request, output, resource.mimeType, resource.body);
    }

    private void contentBlobs(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = authenticate(request);
        FolioleCompanionSyncGroupContentBlobBatch.Result batch = snapshots.read(
            peer, snapshot -> FolioleCompanionSyncGroupContentBlobBatch.load(snapshot, decryptRequest(request)));
        workgroupBytes(request, output, batch.mimeType, batch.body);
    }

    private void attachment(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = authenticate(request);
        FolioleCompanionSyncGroupResources.Resource resource = snapshots.read(
            peer, snapshot -> FolioleCompanionSyncGroupResources.attachment(
                context, snapshot, query(request.path, "attachment_id"), query(request.path, "content_hash")));
        if (resource == null) workgroupJson(request, output, 404, error("missing_file"));
        else workgroupBytes(request, output, resource.mimeType, resource.body);
    }

    private String authenticate(FolioleCompanionHttpRequest request) throws Exception {
        return FolioleCompanionSyncGroupRequestAuth.authenticate(context, request,
            config.getJSONObject("sync_group").getString("group_id"), dataBridge);
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
