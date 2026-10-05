package com.foliole.android;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
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
    final String fingerprint;
    final String groupId;
    final String platform;
    final String publicKey;
    final String requestId;
    final String requestedAt;
    JSONObject acceptance;

    FolioleCompanionJoinRequest(JSONObject value, long nowMs) throws Exception {
        if (value.has("merge_proof")) {
            exactKeys(value, "contract_version", "device", "ephemeral_public_key", "group_id", "merge_proof");
        } else {
            exactKeys(value, "contract_version", "device", "ephemeral_public_key", "group_id");
        }
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
        fingerprint = fingerprint(value);
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

    String deviceIdentityKey() throws Exception {
        return new JSONArray().put(1).put(groupId)
            .put(device.getString("device_anchor"))
            .put(device.getString("canonical_library_path"))
            .toString().replace("\\/", "/");
    }

    private static String fingerprint(JSONObject value) throws Exception {
        ArrayList<String> fields = new ArrayList<>(Arrays.asList(
            "foliole-sync-group-join-attempt-v1", "1", required(value, "group_id"),
            required(value, "ephemeral_public_key"),
            required(value.getJSONObject("device"), "canonical_library_path"),
            required(value.getJSONObject("device"), "device_anchor"),
            required(value.getJSONObject("device"), "device_name"),
            required(value.getJSONObject("device"), "path_flavor"),
            required(value.getJSONObject("device"), "platform")
        ));
        JSONObject proof = value.optJSONObject("merge_proof");
        fields.add(proof == null ? "no-proof" : "proof");
        if (proof != null) {
            JSONObject revisions = proof.optJSONObject("source_proof_revisions");
            long revision = nonnegativeInteger(proof.opt("proof_revision"));
            if (revisions == null) throw new IllegalArgumentException("sync_group_join_merge_proof_invalid");
            ArrayList<String> keys = new ArrayList<>();
            java.util.Iterator<String> iterator = revisions.keys();
            while (iterator.hasNext()) keys.add(iterator.next());
            Collections.sort(keys);
            fields.add(required(proof, "library_epoch"));
            fields.add(Long.toString(revision));
            fields.add(Integer.toString(keys.size()));
            for (String key : keys) {
                if (key.isEmpty() || !key.equals(key.trim())) {
                    throw new IllegalArgumentException("sync_group_join_merge_proof_invalid");
                }
                fields.add(key);
                fields.add(Long.toString(nonnegativeInteger(revisions.opt(key))));
            }
        } else if (value.has("merge_proof")) {
            throw new IllegalArgumentException("sync_group_join_merge_proof_invalid");
        }
        ByteArrayOutputStream canonical = new ByteArrayOutputStream();
        for (String field : fields) {
            byte[] bytes = field.getBytes(StandardCharsets.UTF_8);
            canonical.write(ByteBuffer.allocate(4).putInt(bytes.length).array());
            canonical.write(bytes);
        }
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray());
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte item : digest) hex.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return hex.toString();
    }

    private static long nonnegativeInteger(Object value) {
        if (!(value instanceof Number)) throw new IllegalArgumentException("sync_group_join_merge_proof_invalid");
        double number = ((Number) value).doubleValue();
        long integer = ((Number) value).longValue();
        if (!Double.isFinite(number) || number != integer || integer < 0 || number > 9_007_199_254_740_991d) {
            throw new IllegalArgumentException("sync_group_join_merge_proof_invalid");
        }
        return integer;
    }

    private static void validateDevice(JSONObject device) throws Exception {
        String flavor = required(device, "path_flavor");
        if (!"posix".equals(flavor) && !"windows".equals(flavor)) {
            throw new IllegalArgumentException("library_path_flavor_invalid");
        }
        String path = required(device, "canonical_library_path");
        if (!("posix".equals(flavor) ? isCanonicalPosixPath(path) : isCanonicalWindowsPath(path))) {
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

    private static boolean isCanonicalWindowsPath(String value) {
        if (value.indexOf('/') >= 0 || value.startsWith("\\\\?\\")) return false;
        if (value.matches("^[a-z]:\\\\.*$") && value.equals(value.toLowerCase(Locale.ROOT))) {
            return canonicalSegments(value.substring(3), 0);
        }
        if (!value.startsWith("\\\\")) return false;
        return canonicalSegments(value.substring(2), 2);
    }

    private static boolean canonicalSegments(String value, int minimum) {
        if (value.isEmpty()) return minimum == 0;
        String[] segments = value.split("\\\\", -1);
        if (segments.length < minimum) return false;
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
