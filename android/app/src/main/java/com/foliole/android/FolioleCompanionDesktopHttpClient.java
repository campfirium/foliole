package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
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
        if (prepared.headers.has("X-Sync-Group-Id") && !preparedWorkgroup) {
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
        if (status < 200 || status >= 300) {
            String errorCode = readSafeErrorCode(connection, status);
            connection.disconnect();
            throw binaryResourceError(status, errorCode, method, prepared.path);
        }
        try (InputStream inputStream = connection.getInputStream()) {
            byte[] responseBody = readBytes(inputStream);
            String contentType = connection.getContentType();
            if (prepared.headers.has("X-Sync-Group-Id")) {
                responseBody = FolioleCompanionWorkgroupHttp.decryptResponse(
                    context, connection, method, prepared.path, responseBody);
                contentType = connection.getHeaderField("X-Foliole-Original-Content-Type");
            }
            return new BinaryResponse(responseBody, contentType);
        }
    }

    static void downloadToFile(Context context, String url, JSONObject headers, java.io.File outputFile) throws Exception {
        byte[] body = requestBytes(context, url, headers);
        try (OutputStream outputStream = new BufferedOutputStream(new FileOutputStream(outputFile), COPY_BUFFER_BYTES)) {
            outputStream.write(body);
        }
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

    private static String readSafeErrorCode(HttpURLConnection connection, int status) {
        try {
            String error = new JSONObject(readBody(connection, status)).optString("error", "");
            return isSafeErrorCode(error) ? error : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isSafeErrorCode(String value) {
        return "expired_timestamp".equals(value)
            || "invalid_signature".equals(value)
            || "missing_headers".equals(value)
            || "protocol_pairing_repair_required".equals(value)
            || "replayed_nonce".equals(value)
            || "unknown_device".equals(value);
    }

    private static byte[] readBytes(InputStream inputStream) throws Exception {
        if (inputStream == null) return new byte[0];
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (InputStream buffered = new BufferedInputStream(inputStream, COPY_BUFFER_BYTES)) {
            copy(buffered, output);
        }
        return output.toByteArray();
    }

    private static void copy(InputStream inputStream, OutputStream output) throws Exception {
        byte[] buffer = new byte[COPY_BUFFER_BYTES];
        int read;
        while ((read = inputStream.read(buffer)) >= 0) {
            output.write(buffer, 0, read);
        }
    }
}
