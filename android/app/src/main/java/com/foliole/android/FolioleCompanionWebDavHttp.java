package com.foliole.android;

import android.content.Context;

import com.foliole.android.framed.FramedSyncFiles;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okio.BufferedSink;

final class FolioleCompanionWebDavHttp {
    private static final int CHUNK_BYTES = 64 * 1024;
    private static final int MAX_CHUNKS = 1_000_000;
    private static final String DIRECTION = "foliole-[a-f0-9]{64}-(desktop|phone)";
    private static final String COLLECTIONS = DIRECTION + "-collections/";
    private static final String DIRECTORY = "(?:" + DIRECTION + "/|" + COLLECTIONS
        + "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)";
    private static final String PACKET = "[0-9]{8}T[0-9]{6}\\.[0-9]{3}Z-[a-f0-9-]{36}(?:\\.asset)?\\.bin";
    private static final Set<String> METHODS = Set.of("DELETE", "GET", "MKCOL", "MOVE", "PROPFIND", "PUT");
    private static final ConcurrentHashMap<String, Operation> ACTIVE = new ConcurrentHashMap<>();
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .callTimeout(30, TimeUnit.SECONDS).addNetworkInterceptor(chain -> {
            Response response = chain.proceed(chain.request());
            Progress progress = chain.request().tag(Progress.class);
            if (progress != null && (response.code() == 429 || response.code() == 503)) {
                progress.retryAfter = response.header("Retry-After");
            }
            // Keep the retry decision in the shared scheduler, including Retry-After: 0.
            return response.code() == 503 ? response.newBuilder().removeHeader("Retry-After").build() : response;
        }).build();

    private FolioleCompanionWebDavHttp() {}

    static void start(Context context, PluginCall input, ExecutorService executor) {
        try {
            FramedSyncPayloadBudget owner = owner(input);
            String id = input.getString("request_id", "");
            if (!id.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("webdav_relay_request_id_invalid");
            Operation operation = new Operation(owner);
            if (ACTIVE.putIfAbsent(id, operation) != null) throw new IllegalArgumentException("webdav_relay_request_busy");
            try {
                executor.execute(() -> {
                    try (var lifetime = owner.operation(operation::cancel)) {
                        input.resolve(request(context, input, id, operation));
                    } catch (Exception error) {
                        input.reject("WebDAV request failed.", error);
                    } finally {
                        ACTIVE.remove(id, operation);
                    }
                });
            } catch (RuntimeException error) {
                ACTIVE.remove(id, operation);
                throw error;
            }
        } catch (Exception error) {
            input.reject("WebDAV request failed.", error);
        }
    }

    private static FramedSyncPayloadBudget owner(PluginCall input) {
        FramedSyncPayloadBudget owner = FramedSyncPayloadBudgetRegistry.current();
        if (owner.isClosed() || !owner.libraryKey().equals(input.getString("library_key")) ||
            !owner.generationId().equals(input.getString("generation_id"))) {
            throw new IllegalArgumentException("webdav_relay_owner_changed");
        }
        return owner;
    }

    private static JSObject request(Context context, PluginCall input, String id, Operation operation) throws Exception {
        FramedSyncFiles files = new FramedSyncFiles(context, operation.owner.libraryKey());
        Progress progress = new Progress();
        Call call = CLIENT.newCall(buildRequest(input, files, progress));
        operation.open(call);
        try (Response response = call.execute()) {
            progress.status = response.code();
            if (response.body() != null) {
                try (InputStream body = response.body().byteStream()) {
                    storeResponse(files, id, body, progress);
                }
            }
            return progress.result(null);
        } catch (IOException failure) {
            return progress.result(failureCode(failure));
        }
    }

    private static String failureCode(IOException failure) {
        String message = failure.getMessage();
        if (message != null && message.contains("CLEARTEXT")) return "cleartext_policy";
        return failure.getClass().getSimpleName();
    }

    static void cancel(PluginCall input) {
        try {
            FramedSyncPayloadBudget owner = owner(input);
            Operation operation = ACTIVE.get(input.getString("request_id", ""));
            if (operation != null && operation.owner == owner) operation.cancel();
            input.resolve();
        } catch (Exception error) {
            input.reject("WebDAV cancellation failed.", error);
        }
    }

    private static final class Operation {
        final FramedSyncPayloadBudget owner;
        private boolean cancelled;
        private Call call;

        Operation(FramedSyncPayloadBudget owner) { this.owner = owner; }

        synchronized void open(Call call) {
            this.call = call;
            if (cancelled) call.cancel();
        }

        synchronized void cancel() {
            cancelled = true;
            if (call != null) call.cancel();
        }
    }

    static boolean isDeletableCollection(String path) {
        return path.matches(DIRECTORY);
    }

    private static Request buildRequest(PluginCall input, FramedSyncFiles files, Progress progress) {
        HttpUrl root = HttpUrl.get(input.getString("root", ""));
        HttpUrl url = HttpUrl.get(input.getString("url", ""));
        String method = input.getString("method", "");
        if (!METHODS.contains(method) || !sameOrigin(root, url) || !validUrl(root) || !validUrl(url) ||
            !root.encodedPath().endsWith("/") || !url.encodedPath().startsWith(root.encodedPath())) {
            throw new IllegalArgumentException("webdav_relay_url_invalid");
        }
        String path = url.encodedPath().substring(root.encodedPath().length());
        Request.Builder builder = new Request.Builder().url(url).tag(Progress.class, progress).header("Accept-Encoding", "identity");
        switch (method) {
            case "PROPFIND":
                if (!path.isEmpty() && !path.matches(DIRECTORY) && !path.matches(COLLECTIONS)) throw invalidPath();
                String depth = input.getString("depth", "0");
                if (!depth.equals("0") && !depth.equals("1")) throw invalidPath();
                builder.header("Depth", depth);
                break;
            case "DELETE":
                if (!isDeletableCollection(path)) throw invalidPath();
                break;
            case "MKCOL":
                if (!path.matches(DIRECTORY) && !path.matches(COLLECTIONS)) throw invalidPath();
                break;
            case "GET":
                if (!path.matches(DIRECTORY + PACKET + "(\\.partial)?")) throw invalidPath();
                break;
            default:
                if (!path.matches(DIRECTORY + PACKET + "\\.partial")) throw invalidPath();
        }
        if (method.equals("MOVE")) {
            String destination = url.toString().substring(0, url.toString().length() - ".partial".length());
            builder.header("Destination", destination).header("Overwrite", "F");
        }
        return builder.method(method, method.equals("PUT") ? upload(input, files, progress, path) : null).build();
    }

    private static boolean sameOrigin(HttpUrl left, HttpUrl right) {
        return left.scheme().equals(right.scheme()) && left.host().equals(right.host()) && left.port() == right.port();
    }

    private static boolean validUrl(HttpUrl url) {
        return url.username().isEmpty() && url.password().isEmpty() && url.query() == null && url.fragment() == null;
    }

    private static IllegalArgumentException invalidPath() {
        return new IllegalArgumentException("webdav_relay_path_invalid");
    }

    private static RequestBody upload(PluginCall input, FramedSyncFiles files, Progress progress, String path) {
        String directory = input.getString("upload_directory", "");
        String scope = path.substring("foliole-".length(), "foliole-".length() + 64);
        int count = input.getInt("upload_chunks", 0);
        long bytes = Long.parseLong(input.getString("upload_bytes", "0"));
        if (!directory.matches("webdav-relay/" + scope + "-[a-f0-9]{64}") || count < 1 ||
            count > MAX_CHUNKS || bytes < 1) throw invalidPath();
        return new RequestBody() {
            @Override public MediaType contentType() { return MediaType.get("application/octet-stream"); }
            @Override public long contentLength() { return bytes; }
            @Override public boolean isOneShot() { return true; }
            @Override public void writeTo(BufferedSink sink) throws IOException {
                for (int i = 0; i < count; i++) {
                    byte[] chunk;
                    try { chunk = files.read(directory + "/" + i); }
                    catch (Exception error) { throw new IOException("webdav_relay_pending_bytes_unavailable", error); }
                    if (chunk == null || progress.uploaded + chunk.length > bytes) {
                        throw new IOException("webdav_relay_pending_bytes_invalid");
                    }
                    for (int offset = 0; offset < chunk.length; offset += CHUNK_BYTES) {
                        int size = Math.min(CHUNK_BYTES, chunk.length - offset);
                        sink.write(chunk, offset, size);
                        progress.uploaded += size;
                    }
                }
                if (progress.uploaded != bytes) throw new IOException("webdav_relay_upload_length_invalid");
            }
        };
    }

    private static void storeResponse(FramedSyncFiles files, String id, InputStream body, Progress progress) throws IOException {
        byte[] buffer = new byte[CHUNK_BYTES];
        for (;;) {
            int size = body.read(buffer);
            if (size < 0) return;
            progress.downloaded += size;
            if (progress.chunks >= MAX_CHUNKS) throw new IOException("webdav_relay_response_limit");
            try { files.write("requests/" + id + "/" + progress.chunks++, Arrays.copyOf(buffer, size)); }
            catch (Exception error) { throw new IOException("webdav_relay_response_write_failed", error); }
        }
    }

    private static final class Progress {
        int status;
        String retryAfter;
        int chunks;
        long uploaded;
        long downloaded;

        JSObject result(String failure) {
            return new JSObject().put("status", status).put("chunks", chunks)
                .put("uploaded_bytes", uploaded).put("downloaded_bytes", downloaded).put("failed", failure != null).put("failure_code", failure).put("retry_after", retryAfter);
        }
    }
}
