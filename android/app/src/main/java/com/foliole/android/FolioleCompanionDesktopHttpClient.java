package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

final class FolioleCompanionDesktopHttpClient {
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int COPY_BUFFER_BYTES = 256 * 1024;
    private static final int READ_TIMEOUT_MS = 30 * 1000;

    private FolioleCompanionDesktopHttpClient() {}

    static final class SyncPackSourceViewUnavailable extends Exception {
        SyncPackSourceViewUnavailable() { super("sync_pack_source_view_unavailable"); }
    }

    static final class BinaryResponse {
        final byte[] body;
        final String contentType;

        BinaryResponse(byte[] body, String contentType) {
            this.body = body;
            this.contentType = contentType;
        }
    }

    static JSObject request(Context context, String url, String method, JSONObject headers, String body) throws Exception {
        boolean preparedWorkgroup = FolioleCompanionWorkgroupHttp.isPrepared(headers);
        FolioleCompanionWorkgroupHttp.PreparedRequest prepared = preparedWorkgroup
            ? FolioleCompanionWorkgroupHttp.acceptPrepared(url, headers, body)
            : FolioleCompanionWorkgroupHttp.prepare(context, url, method, headers, body);
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod(method);
        applyHeaders(connection, prepared.headers);
        if (prepared.body != null) {
            connection.setDoOutput(true);
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(prepared.body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        JSObject result = new JSObject();
        result.put(FolioleCompanionHostBridgeContractDefinitions.networkStatusResponseKey(context), status);
        byte[] responseBody = readBytes(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
        if (prepared.headers.has("X-Sync-Group-Id")) {
            responseBody = FolioleCompanionWorkgroupHttp.decryptResponse(
                context, connection, method, prepared.path, responseBody);
        }
        result.put(FolioleCompanionHostBridgeContractDefinitions.networkBodyResponseKey(context),
            new String(responseBody, StandardCharsets.UTF_8));
        return result;
    }

    static byte[] requestBytes(Context context, String url, JSONObject headers) throws Exception {
        return requestBytes(context, url, "GET", headers, null);
    }

    static byte[] requestBytes(Context context, String url, String method, JSONObject headers, String body) throws Exception {
        return requestBinary(context, url, method, headers, body).body;
    }

    static BinaryResponse requestBinary(Context context, String url, String method, JSONObject headers, String body) throws Exception {
        FolioleCompanionWorkgroupHttp.PreparedRequest prepared =
            FolioleCompanionWorkgroupHttp.prepare(context, url, method, headers, body);
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod(method);
        applyHeaders(connection, prepared.headers);
        if (prepared.body != null) {
            connection.setDoOutput(true);
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(prepared.body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        try {
            byte[] responseBody = readBytes(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            String contentType = connection.getContentType();
            if (prepared.headers.has("X-Sync-Group-Id")) {
                responseBody = FolioleCompanionWorkgroupHttp.decryptResponse(
                    context, connection, method, prepared.path, responseBody);
                contentType = connection.getHeaderField("X-Foliole-Original-Content-Type");
            }
            if (status < 200 || status >= 300) {
                throw binaryResourceError(status, readSafeErrorCode(responseBody), method, prepared.path);
            }
            return new BinaryResponse(responseBody, contentType);
        } finally { connection.disconnect(); }
    }

    static void downloadToFile(Context context, String url, JSONObject headers, File outputFile) throws Exception {
        long maximumBytes = new URL(url).getPath().equals("/companion/sync-pack")
            ? FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES : Long.MAX_VALUE;
        FolioleCompanionWorkgroupHttp.PreparedRequest prepared =
            FolioleCompanionWorkgroupHttp.prepare(context, url, "GET", headers, null);
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod("GET");
        applyHeaders(connection, prepared.headers);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                byte[] error = readBytes(connection.getErrorStream(), 64 * 1024);
                if (prepared.headers.has("X-Sync-Group-Id")) {
                    error = FolioleCompanionWorkgroupHttp.decryptResponse(
                        context, connection, "GET", prepared.path, error);
                    if (status == 409 && new URL(url).getPath().equals("/companion/sync-pack")
                        && "sync_pack_source_view_unavailable".equals(
                            new JSONObject(new String(error, StandardCharsets.UTF_8)).optString("error"))) {
                        throw new SyncPackSourceViewUnavailable();
                    }
                }
                throw binaryResourceError(status, readSafeErrorCode(error), "GET", prepared.path);
            }
            try (InputStream input = connection.getInputStream()) {
                if (prepared.headers.has("X-Sync-Group-Id")) {
                    FolioleCompanionWorkgroupHttp.decryptResponseToFile(
                        context, connection, "GET", prepared.path, input, outputFile, maximumBytes);
                } else {
                    try (OutputStream output = new BufferedOutputStream(
                        new FileOutputStream(outputFile), COPY_BUFFER_BYTES)) {
                        copy(input, output, maximumBytes);
                    }
                }
            }
        } catch (SecurityException error) {
            throw new SecurityException(error.getMessage() + "; http_status=" + connection.getResponseCode(), error);
        } finally { connection.disconnect(); }
    }

    private static void applyHeaders(HttpURLConnection connection, JSONObject headers) throws Exception {
        if (headers == null) {
            return;
        }
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = headers.get(key);
            if (value instanceof String) {
                connection.setRequestProperty(key, (String) value);
            }
        }
    }

    private static String readBody(HttpURLConnection connection, int status) throws Exception {
        InputStream inputStream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (inputStream == null) {
            return "";
        }
        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
        }
        return body.toString();
    }

    private static IllegalStateException binaryResourceError(
        int status, String errorCode, String method, String path
    ) {
        String detail = errorCode == null ? "." : " (" + errorCode + ").";
        return new IllegalStateException(
            "Desktop binary resource " + method + " " + safeResourcePath(path) +
            " returned " + status + detail
        );
    }

    private static String safeResourcePath(String path) {
        String route = path == null ? "" : path.split("\\?", 2)[0];
        return "/companion/sync-pack".equals(route)
            || "/companion/attachment-resource".equals(route)
            || "/companion/content-blob".equals(route)
            || "/companion/content-blobs".equals(route) ? route : "/companion/resource";
    }

    private static String readSafeErrorCode(byte[] body) {
        try {
            String error = new JSONObject(new String(body, StandardCharsets.UTF_8)).optString("error", "");
            return isSafeErrorCode(error) ? error : null;
        } catch (Exception ignored) { return null; }
    }

    private static boolean isSafeErrorCode(String value) {
        return "expired_timestamp".equals(value)
            || "invalid_signature".equals(value)
            || "missing_headers".equals(value)
            || "replayed_nonce".equals(value)
            || "unknown_authorization".equals(value);
    }

    private static byte[] readBytes(InputStream inputStream) throws Exception {
        return readBytes(inputStream, Long.MAX_VALUE);
    }

    private static byte[] readBytes(InputStream inputStream, long maximumBytes) throws Exception {
        if (inputStream == null) return new byte[0];
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (InputStream buffered = new BufferedInputStream(inputStream, COPY_BUFFER_BYTES)) {
            copy(buffered, output, maximumBytes);
        }
        return output.toByteArray();
    }

    private static void copy(InputStream inputStream, OutputStream output) throws Exception {
        copy(inputStream, output, Long.MAX_VALUE);
    }

    private static void copy(InputStream inputStream, OutputStream output, long maximumBytes) throws Exception {
        byte[] buffer = new byte[COPY_BUFFER_BYTES];
        int read;
        long total = 0;
        while ((read = inputStream.read(buffer)) >= 0) {
            total += read;
            if (total > maximumBytes) throw new IllegalArgumentException("sync_pack_transfer_limit_exceeded");
            output.write(buffer, 0, read);
        }
    }
}
