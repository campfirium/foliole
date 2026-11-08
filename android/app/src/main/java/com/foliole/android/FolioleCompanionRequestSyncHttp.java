package com.foliole.android;

import android.content.Context;
import android.net.Uri;
import com.foliole.android.framed.FramedSyncFiles;
import com.foliole.android.framed.FramedSyncHttpTransport;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

final class FolioleCompanionRequestSyncHttp {
    private static final Map<String, Operation> ACTIVE = new ConcurrentHashMap<>();
    private FolioleCompanionRequestSyncHttp() {}

    interface DesktopRequest { JSObject execute(ConnectionOpened opened) throws Exception; }
    interface ConnectionOpened { void accept(HttpURLConnection connection) throws Exception; }

    static void desktop(PluginCall call, DesktopRequest request) {
        try {
            String id = call.getString("request_id") == null ? null : requestId(call);
            Operation operation = id == null ? null : new Operation(owner(call));
            if (id != null && ACTIVE.putIfAbsent(id, operation) != null) {
                throw new IllegalStateException("request_sync_http_duplicate");
            }
            new Thread(() -> {
                try {
                    if (operation != null) operation.check();
                    call.resolve(request.execute(connection -> {
                        if (operation != null) operation.opened(connection);
                    }));
                } catch (Exception error) { call.reject(error.getMessage(), error); }
                finally { if (id != null) ACTIVE.remove(id, operation); }
            }).start();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    static void post(Context context, PluginCall call, ExecutorService executor) {
        try {
            FramedSyncPayloadBudget owner = owner(call);
            String id = requestId(call);
            Operation operation = new Operation(owner);
            if (call.getObject("attachment_batch_receive") != null) {
                operation.batch = new FolioleAttachmentBatchHttpStream(call);
            }
            if (ACTIVE.putIfAbsent(id, operation) != null) throw new IllegalStateException("request_sync_http_duplicate");
            try { executor.execute(() -> {
                try (var lifetime = owner.operation(operation::cancel)) {
                    JSObject result = execute(context, call, operation);
                    if (operation.batch == null) call.resolve(result); else operation.batch.deliver(result);
                }
                catch (Exception error) {
                    if (operation.cancelled.get() && !(error instanceof FolioleAttachmentReceiveFile.StorageFailure) &&
                        (com.foliole.android.framed.FramedSyncStreamReader.isTransportInterruption(error) || error instanceof InterruptedException)) reject(call, operation, "request_sync_http_cancelled", "E_ABORT", error);
                    else if (error instanceof java.net.SocketTimeoutException) reject(call, operation, error.getMessage(), "ETIMEDOUT", error);
                    else reject(call, operation, error.getMessage(), null, error);
                }
                finally { ACTIVE.remove(id, operation); operation.stopped.complete(null); }
            }); } catch (RuntimeException error) {
                ACTIVE.remove(id, operation);
                throw error;
            }
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    private static void reject(PluginCall call, Operation operation, String message, String code, Exception error) {
        if (operation.batch == null) call.reject(message, code, error);
        else operation.batch.reject(message, code, error);
    }

    static void readBatch(PluginCall call) throws Exception {
        FramedSyncPayloadBudget owner = owner(call);
        Operation operation = ACTIVE.get(requestId(call));
        if (operation == null || operation.owner != owner || operation.batch == null) {
            throw new IllegalStateException("attachment_batch_read_unavailable");
        }
        operation.batch.next(call);
    }

    static void cancelOwner(FramedSyncPayloadBudget owner) {
        for (Operation operation : ACTIVE.values()) if (operation.owner == owner) operation.cancel();
    }

    static void cancel(PluginCall call) throws Exception {
        FramedSyncPayloadBudget owner = owner(call);
        Operation operation = ACTIVE.get(requestId(call));
        if (operation != null && operation.owner == owner) {
            operation.cancel();
            if (operation.batch != null) {
                operation.stopped.thenRun(() -> call.resolve());
                return;
            }
        }
        call.resolve();
    }

    private static JSObject execute(Context context, PluginCall call, Operation operation) throws Exception {
        String directory = call.getString("directory");
        Integer count = call.getInt("request_chunk_count");
        JSObject rawHeaders = call.getObject("headers");
        if (directory == null || !directory.matches("requests/[a-f0-9-]{36}") || count == null || rawHeaders == null) {
            throw new IllegalArgumentException("request_sync_http_request_invalid");
        }
        Map<String, String> headers = new HashMap<>();
        java.util.Iterator<String> keys = rawHeaders.keys();
        while (keys.hasNext()) { String key = keys.next(); headers.put(key, rawHeaders.getString(key)); }
        FramedSyncFiles files = new FramedSyncFiles(context, operation.owner.libraryKey());
        FolioleRequestSyncHttpChunks.Check progress = () -> {
            String roundId = call.getString("peer_round_id");
            if (roundId != null) FolioleRequestSyncRoute.touchRound(FolioleCompanionSyncGroupDataBridge.current(),
                operation.owner, call.getString("receiver_device_id"), roundId, "outbound", false);
        };
        operation.check();
        URL url = new URL(call.getString("url"));
        if (operation.batch != null && (call.getObject("attachment_receive") != null ||
            !"/companion/framed-sync".equals(url.getPath()) ||
            !"attachment_batch_pull".equals(Uri.parse(url.toString()).getQueryParameter("request")))) {
            throw new IllegalArgumentException("attachment_batch_http_request_invalid");
        }
        var timing = new FolioleRequestSyncTiming(requestId(call), url);
        return FramedSyncHttpTransport.postRawStream(url, call.getString("sync_group_id"),
            call.getString("receiver_device_id"), call.getString("receiver_library_epoch"), headers,
            FolioleRequestSyncHttpChunks.request(files, directory, count, operation::check, progress, timing::chunk),
            input -> operation.batch != null ? operation.batch.read(context, call, input, operation::check, progress, operation.owner)
                : call.getObject("attachment_receive") == null ? FolioleRequestSyncHttpChunks.read(files, directory, input, operation::check, progress)
                : FolioleRequestSyncAttachmentResponse.read(context, call, input, operation::check, progress, operation.owner),
            operation::opened, timing::phase);
    }

    private static FramedSyncPayloadBudget owner(PluginCall call) {
        FramedSyncPayloadBudget owner = FramedSyncPayloadBudgetRegistry.current();
        if (owner.isClosed() || !owner.libraryKey().equals(call.getString("library_key")) ||
            !owner.generationId().equals(call.getString("generation_id"))) {
            throw new IllegalArgumentException("framed_sync_file_owner_mismatch");
        }
        return owner;
    }

    private static String requestId(PluginCall call) {
        String id = call.getString("request_id");
        if (id == null || !UUID.fromString(id).toString().equals(id)) {
            throw new IllegalArgumentException("request_sync_http_id_invalid");
        }
        return id;
    }

    private static final class Operation {
        final FramedSyncPayloadBudget owner;
        final CompletableFuture<Void> stopped = new CompletableFuture<>();
        FolioleAttachmentBatchHttpStream batch;
        final AtomicBoolean cancelled = new AtomicBoolean();
        final AtomicReference<HttpURLConnection> connection = new AtomicReference<>();
        Operation(FramedSyncPayloadBudget owner) { this.owner = owner; }
        void check() throws InterruptedException {
            if (cancelled.get() || owner.isClosed()) throw new InterruptedException("request_sync_http_cancelled");
        }
        void opened(HttpURLConnection value) throws InterruptedException { connection.set(value); check(); }
        void cancel() {
            cancelled.set(true);
            if (batch != null) batch.cancel();
            HttpURLConnection value = connection.get();
            if (value != null) value.disconnect();
        }
    }
}
