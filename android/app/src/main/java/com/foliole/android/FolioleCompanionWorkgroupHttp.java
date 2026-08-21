package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;

final class FolioleCompanionWorkgroupHttp {
    static final String ENVELOPE_CONTENT_TYPE = "application/vnd.foliole.workgroup-aead+json";

    static final class PreparedRequest {
        final String body;
        final JSONObject headers;
        final String path;

        PreparedRequest(String body, JSONObject headers, String path) {
            this.body = body; this.headers = headers; this.path = path;
        }
    }

    private FolioleCompanionWorkgroupHttp() {}

    static JSONObject compatible(JSONObject protocol) throws Exception {
        return new JSONObject().put("status", "compatible").put("reason", JSONObject.NULL)
            .put("missing_capabilities", new org.json.JSONArray())
            .put("negotiated_version", protocol.getInt("version"));
    }

    static boolean compatibleWith(JSONObject protocol, JSONObject remote) throws Exception {
        if (remote == null) return false;
        int localVersion = protocol.getInt("version");
        if (localVersion < remote.optInt("min_supported_version", Integer.MAX_VALUE) ||
            localVersion > remote.optInt("max_supported_version", Integer.MIN_VALUE)) return false;
        org.json.JSONArray required = protocol.getJSONArray("capabilities");
        org.json.JSONArray offered = remote.optJSONArray("capabilities");
        if (offered == null) return false;
        for (int index = 0; index < required.length(); index++) {
            boolean found = false;
            for (int other = 0; other < offered.length(); other++) {
                found |= required.getString(index).equals(offered.getString(other));
            }
            if (!found) return false;
        }
        return true;
    }

    static PreparedRequest prepare(
        Context context, String url, String method, JSONObject inputHeaders, String body
    ) throws Exception {
        JSONObject headers = inputHeaders == null ? new JSONObject() : new JSONObject(inputHeaders.toString());
        if (trim(headers.optString("X-Sync-Group-Id", null)) == null) {
            return new PreparedRequest(body, headers, path(new URL(url)));
        }
        return prepareWithKey(context, url, method, inputHeaders, body,
            FolioleCompanionCurrentGroupCredential.load(
                headers.getString("X-Sync-Group-Id")
            ).workgroupKey);
    }

    static PreparedRequest prepareWithKey(
        Context context, String url, String method, JSONObject inputHeaders, String body,
        String groupKey
    ) throws Exception {
        JSONObject headers = inputHeaders == null ? new JSONObject() : new JSONObject(inputHeaders.toString());
        String groupId = trim(headers.optString("X-Sync-Group-Id", null));
        String path = path(new URL(url));
        if (groupId == null) return new PreparedRequest(body, headers, path);
        if (body == null) {
            sign(context, headers, method, path, "", groupKey);
            return new PreparedRequest(null, headers, path);
        }
        String contentType = trim(headers.optString("Content-Type", null));
        if (contentType == null) contentType = "application/json; charset=utf-8";
        byte[] plain = body.getBytes(StandardCharsets.UTF_8);
        String encrypted = FolioleCompanionSyncGroupCrypto.encrypt(
            groupKey, FolioleCompanionSyncGroupCrypto.groupTag(groupKey), method, path,
            "request", contentType, plain
        ).toString();
        headers.put("Content-Type", ENVELOPE_CONTENT_TYPE);
        sign(context, headers, method, path, encrypted, groupKey);
        return new PreparedRequest(encrypted, headers, path);
    }

    static boolean isPrepared(JSONObject headers) {
        return headers != null && ENVELOPE_CONTENT_TYPE.equals(headers.optString("Content-Type"));
    }

    static PreparedRequest acceptPrepared(String url, JSONObject inputHeaders, String body) throws Exception {
        JSONObject headers = new JSONObject(inputHeaders.toString());
        if (!isPrepared(headers) || trim(headers.optString("X-Sync-Group-Id", null)) == null
            || trim(headers.optString("X-Authorization-Id", null)) == null
            || trim(headers.optString("X-Nonce", null)) == null
            || trim(headers.optString("X-Signature", null)) == null
            || trim(headers.optString("X-Timestamp", null)) == null || body == null) {
            throw new SecurityException("workgroup_prepared_request_invalid");
        }
        return new PreparedRequest(body, headers, path(new URL(url)));
    }

    static byte[] decryptResponse(
        Context context, HttpURLConnection connection, String method, String path, byte[] body
    ) throws Exception {
        if (!ENVELOPE_CONTENT_TYPE.equals(connection.getContentType())) {
            throw new SecurityException("workgroup_aead_response_required");
        }
        String groupId = trim(connection.getRequestProperty("X-Sync-Group-Id"));
        if (groupId == null) throw new SecurityException("sync_group_id_missing");
        String groupKey = FolioleCompanionCurrentGroupCredential.load(
            groupId
        ).workgroupKey;
        String contentType = trim(connection.getHeaderField("X-Foliole-Original-Content-Type"));
        if (contentType == null) contentType = "application/octet-stream";
        JSONObject envelope = new JSONObject(new String(body, StandardCharsets.UTF_8));
        byte[] plaintext = FolioleCompanionSyncGroupCrypto.decrypt(
            groupKey, FolioleCompanionSyncGroupCrypto.groupTag(groupKey), method, path,
            "response", contentType, envelope
        );
        consumeResponseNonce(context, envelope);
        return plaintext;
    }

    static void writeJson(
        Context context, JSONObject config, FolioleCompanionHttpRequest request,
        OutputStream output, int status, JSONObject body
    ) throws Exception {
        writeBytes(context, config, request, output, status, "application/json; charset=utf-8",
            body.toString().getBytes(StandardCharsets.UTF_8));
    }

    static void writeBytes(
        Context context, JSONObject config, FolioleCompanionHttpRequest request,
        OutputStream output, int status, String contentType, byte[] body
    ) throws Exception {
        String key = FolioleCompanionCurrentGroupCredential.load(
            config.getJSONObject("sync_group").getString("group_id")
        ).workgroupKey;
        byte[] encrypted = FolioleCompanionSyncGroupCrypto.encrypt(
            key, config.getString("group_tag"), request.method, request.path, "response", contentType, body
        ).toString().getBytes(StandardCharsets.UTF_8);
        FolioleCompanionHttpResponse.bytes(
            output, status, ENVELOPE_CONTENT_TYPE, contentType, encrypted
        );
    }

    private static void sign(
        Context context, JSONObject headers, String method, String path, String body, String groupKey
    ) throws Exception {
        String timestamp = Instant.now().toString();
        String nonce = UUID.randomUUID().toString();
        String canonical = method.toUpperCase() + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + sha256(body);
        if (trim(headers.optString("X-Authorization-Id", null)) == null) {
            throw new SecurityException("sync_group_local_member_missing");
        }
        headers.put("X-Nonce", nonce).put("X-Timestamp", timestamp)
            .put("X-Signature", FolioleCompanionPairingCrypto.signCanonicalRequest(groupKey, canonical));
    }

    private static String path(URL url) {
        return url.getPath() + (url.getQuery() == null ? "" : "?" + url.getQuery());
    }

    private static String sha256(String value) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))) {
            result.append(String.format("%02x", item));
        }
        return result.toString();
    }

    private static String trim(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private static void consumeResponseNonce(Context context, JSONObject envelope) {
        long now = System.currentTimeMillis();
        String identity = envelope.optLong("timestamp_ms") + ":" + envelope.optString("nonce");
        SharedPreferences prefs = context.getSharedPreferences("foliole_workgroup_response_nonces", Context.MODE_PRIVATE);
        if (prefs.contains(identity)) throw new SecurityException("workgroup_aead_replayed");
        SharedPreferences.Editor editor = prefs.edit();
        for (String key : prefs.getAll().keySet()) {
            if (prefs.getLong(key, 0) < now) editor.remove(key);
        }
        if (!editor.putLong(identity, now + 60_000).commit()) {
            throw new IllegalStateException("Failed to persist workgroup response nonce.");
        }
    }
}
