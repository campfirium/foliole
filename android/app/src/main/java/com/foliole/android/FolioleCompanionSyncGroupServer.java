package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.net.ServerSocket;
import java.net.Socket;
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
        framedSyncNonces = new FramedSyncSessionNonceSQLite(this.context);
        framedSyncTransfers = new FramedSyncTransferSQLite(this.context);
        server = new ServerSocket(SYNC_PORT); executor.execute(this::acceptLoop);
    }

    int port() { return server.getLocalPort(); }

    void stop() {
        running = false;
        try { server.close(); } catch (Exception ignored) {}
        executor.shutdownNow(); framedSyncNonces.close(); framedSyncTransfers.close();
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
                int status = "sync_group_join_capacity_exceeded".equals(error.getMessage()) ? 429 : 400;
                FolioleCompanionHttpResponse.json(owned.getOutputStream(), status, error(error.getMessage()));
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
        else if (request.method.equals("POST") && path.equals("/companion/framed-sync"))
            FolioleCompanionFramedSyncRoute.handle(context, config, dataBridge,
                request, output, auth.authenticate(request), framedSyncNonces, framedSyncTransfers,
                new java.io.File(context.getCacheDir(), "framed-http-requests"));
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

    private void memberState(FolioleCompanionHttpRequest request, java.io.OutputStream output) throws Exception {
        String peer = auth.authenticate(request, true);
        auth.update(peer, null);
        JSONObject incoming = new JSONObject(decryptRequest(request));
        JSONObject applied = dataBridge.request("apply_member_state", new JSONObject()
            .put("authenticated_device_id", peer).put("state", incoming));
        auth.update(peer, applied);
        workgroupJson(request, output, 200, applied.getJSONObject("state"));
        stateChanged.run();
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

    private static JSONObject error(String value) throws Exception { return new JSONObject().put("error", value); }
}
