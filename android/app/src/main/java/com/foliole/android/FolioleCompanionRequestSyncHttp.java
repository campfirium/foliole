package com.foliole.android;

import android.content.Context;
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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

final class FolioleCompanionRequestSyncHttp {
    private static final Map<String, Operation> ACTIVE = new ConcurrentHashMap<>();
    private FolioleCompanionRequestSyncHttp() {}

    static void post(Context context, PluginCall call, ExecutorService executor) {
        try {
            FramedSyncPayloadBudget owner = owner(call);
            String id = requestId(call);
            Operation operation = new Operation(owner);
            if (ACTIVE.putIfAbsent(id, operation) != null) throw new IllegalStateException("request_sync_http_duplicate");
            try { executor.execute(() -> {
                try { call.resolve(execute(context, call, operation)); }
                catch (Exception error) { call.reject(error.getMessage(), error); }
                finally { ACTIVE.remove(id, operation); }
            }); } catch (RuntimeException error) {
                ACTIVE.remove(id, operation);
                throw error;
            }
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    static void cancel(PluginCall call) throws Exception {
        FramedSyncPayloadBudget owner = owner(call);
        Operation operation = ACTIVE.get(requestId(call));
        if (operation != null && operation.owner == owner) operation.cancel();
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
        operation.check();
        return FramedSyncHttpTransport.postRawStream(new URL(call.getString("url")), call.getString("sync_group_id"),
            call.getString("receiver_device_id"), call.getString("receiver_library_epoch"), headers,
            output -> FolioleRequestSyncHttpChunks.write(files, directory, count, output, operation::check),
            input -> FolioleRequestSyncHttpChunks.read(files, directory, input, operation::check), operation::opened);
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
        final AtomicBoolean cancelled = new AtomicBoolean();
        final AtomicReference<HttpURLConnection> connection = new AtomicReference<>();
        Operation(FramedSyncPayloadBudget owner) { this.owner = owner; }
        void check() throws InterruptedException {
            if (cancelled.get() || owner.isClosed()) throw new InterruptedException("request_sync_http_cancelled");
        }
        void opened(HttpURLConnection value) throws InterruptedException { connection.set(value); check(); }
        void cancel() {
            cancelled.set(true);
            HttpURLConnection value = connection.get();
            if (value != null) value.disconnect();
        }
    }
}
