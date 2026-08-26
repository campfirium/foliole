package com.foliole.android;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.SimpleTimeZone;
import java.util.UUID;
import java.util.regex.Pattern;

final class FolioleCompanionJoinRequest {
    static final long TTL_MS = 2L * 60L * 1000L;
    private static final Pattern UUID_V4 = Pattern.compile(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    );
    private static final Pattern BASE64_URL = Pattern.compile("^[A-Za-z0-9_-]+$");
    final String deviceName;
    final JSONObject device;
    final String expiresAt;
    final long expiresAtMs;
    final String groupId;
    final String platform;
    final String publicKey;
    final String requestId;
    final String requestedAt;
    JSONObject acceptance;

    FolioleCompanionJoinRequest(JSONObject value, long nowMs) throws Exception {
        exactKeys(value, "contract_version", "device", "ephemeral_public_key", "group_id");
        Object contractVersion = value.opt("contract_version");
        if (!(contractVersion instanceof Number) || ((Number) contractVersion).intValue() != 1
            || ((Number) contractVersion).doubleValue() != 1.0d) {
            throw new IllegalArgumentException("sync_group_join_contract_incompatible");
        }
        JSONObject deviceValue = value.getJSONObject("device");
        exactKeys(deviceValue, "canonical_library_path", "device_anchor", "device_name", "path_flavor", "platform");
        validateDevice(deviceValue);
        device = new JSONObject(deviceValue.toString());
        groupId = required(value, "group_id");
        publicKey = validatePublicKey(required(value, "ephemeral_public_key"));
        deviceName = required(deviceValue, "device_name");
        platform = required(deviceValue, "platform");
        requestId = UUID.randomUUID().toString();
        requestedAt = timestamp(nowMs);
        expiresAtMs = nowMs + TTL_MS;
        expiresAt = timestamp(expiresAtMs);
    }

    boolean expired(long nowMs) { return expiresAtMs <= nowMs; }

    JSONObject publicJson() throws Exception {
        return new JSONObject().put("device_name", deviceName).put("expires_at", expiresAt)
            .put("platform", platform).put("request_id", requestId)
            .put("requested_at", requestedAt).put("status", acceptance == null ? "pending" : "accepted");
    }

    JSONObject registeredDevice(String identityKey) throws Exception {
        return new JSONObject(device.toString())
            .put("device_identity_key", identityKey);
    }

    private static void validateDevice(JSONObject device) throws Exception {
        if (!"posix".equals(required(device, "path_flavor"))) {
            throw new IllegalArgumentException("library_path_flavor_invalid");
        }
        String path = required(device, "canonical_library_path");
        if (!isCanonicalPosixPath(path)) {
            throw new IllegalArgumentException("library_path_not_canonical");
        }
        if (!UUID_V4.matcher(required(device, "device_anchor")).matches()) {
            throw new IllegalArgumentException("device_anchor_invalid");
        }
        required(device, "device_name"); required(device, "platform");
    }

    private static String validatePublicKey(String value) {
        if (!BASE64_URL.matcher(value).matches()) {
            throw new IllegalArgumentException("sync_group_join_public_key_invalid");
        }
        byte[] decoded;
        try { decoded = Base64.decode(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
        catch (IllegalArgumentException error) { throw new IllegalArgumentException("sync_group_join_public_key_invalid", error); }
        if (decoded.length != 65 || decoded[0] != 4) {
            throw new IllegalArgumentException("sync_group_join_public_key_invalid");
        }
        return value;
    }

    private static String required(JSONObject value, String key) throws Exception {
        Object raw = value.opt(key);
        if (!(raw instanceof String)) throw new IllegalArgumentException(key + "_invalid");
        String result = (String) raw;
        if (result.isEmpty() || !result.equals(result.trim()) || result.indexOf('\0') >= 0) {
            throw new IllegalArgumentException(key + "_invalid");
        }
        return result;
    }

    private static boolean isCanonicalPosixPath(String value) {
        if (!value.startsWith("/") || (value.length() > 1 && value.endsWith("/"))) return false;
        String[] segments = value.substring(1).split("/", -1);
        for (String segment : segments) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) return false;
        }
        return true;
    }

    private static void exactKeys(JSONObject value, String... expected) {
        Set<String> actual = new HashSet<>();
        JSONArray names = value.names();
        if (names != null) for (int index = 0; index < names.length(); index++) actual.add(names.optString(index));
        if (!actual.equals(new HashSet<>(Arrays.asList(expected)))) {
            throw new IllegalArgumentException("sync_group_join_payload_shape_invalid");
        }
    }

    private static String timestamp(long value) {
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US
        );
        format.setTimeZone(new SimpleTimeZone(0, "UTC"));
        return format.format(new Date(value));
    }
}
