package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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

    static JSObject request(Context context, String url, String method, JSONObject headers, String body) throws Exception {
        return request(context, url, method, headers, body, connection -> {});
    }

    static JSObject request(Context context, String url, String method, JSONObject headers, String body,
            FolioleCompanionRequestSyncHttp.ConnectionOpened opened) throws Exception {
        boolean preparedWorkgroup = FolioleCompanionWorkgroupHttp.isPrepared(headers);
        FolioleCompanionWorkgroupHttp.PreparedRequest prepared = preparedWorkgroup
            ? FolioleCompanionWorkgroupHttp.acceptPrepared(url, headers, body)
            : FolioleCompanionWorkgroupHttp.prepare(context, url, method, headers, body);
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
        opened.accept(connection);
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
