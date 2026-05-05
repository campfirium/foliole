package com.foliole.android;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

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
    private static final int READ_TIMEOUT_MS = 5 * 60 * 1000;

    private FolioleCompanionDesktopHttpClient() {}

    static final class BinaryResponse {
        final byte[] body;
        final String contentType;

        BinaryResponse(byte[] body, String contentType) {
            this.body = body;
            this.contentType = contentType;
        }
    }

    static JSObject request(String url, String method, JSONObject headers, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod(method);
        applyHeaders(connection, headers);
        if (body != null) {
            connection.setDoOutput(true);
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("body", readBody(connection, status));
        connection.disconnect();
        return result;
    }

    static byte[] requestBytes(String url, JSONObject headers) throws Exception {
        return requestBytes(url, "GET", headers, null);
    }

    static byte[] requestBytes(String url, String method, JSONObject headers, String body) throws Exception {
        return requestBinary(url, method, headers, body).body;
    }

    static BinaryResponse requestBinary(String url, String method, JSONObject headers, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod(method);
        applyHeaders(connection, headers);
        if (body != null) {
            connection.setDoOutput(true);
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("Desktop binary resource returned " + status + ".");
        }
        try (InputStream inputStream = connection.getInputStream()) {
            return new BinaryResponse(readBytes(inputStream), connection.getContentType());
        } finally {
            connection.disconnect();
        }
    }

    static void downloadToFile(String url, JSONObject headers, java.io.File outputFile) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod("GET");
        applyHeaders(connection, headers);
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("Desktop binary resource returned " + status + ".");
        }
        try (
            InputStream inputStream = connection.getInputStream();
            FileOutputStream outputStream = new FileOutputStream(outputFile)
        ) {
            copy(inputStream, outputStream);
        } finally {
            connection.disconnect();
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

    private static byte[] readBytes(InputStream inputStream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        copy(inputStream, output);
        return output.toByteArray();
    }

    private static void copy(InputStream inputStream, OutputStream output) throws Exception {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = inputStream.read(buffer)) >= 0) {
            output.write(buffer, 0, read);
        }
    }
}
