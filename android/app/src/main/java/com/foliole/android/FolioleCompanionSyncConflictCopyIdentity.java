package com.foliole.android;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class FolioleCompanionSyncConflictCopyIdentity {

    private static final String CONFLICT_COPY_PREFIX = "conflict-copy-";

    private FolioleCompanionSyncConflictCopyIdentity() {}

    static String sourceDeviceId(JSONObject record) {
        String deviceId = record.optString("device_id", "").trim();
        return deviceId.isEmpty() ? "remote" : deviceId;
    }

    static String copyNodeId(JSONObject record) throws Exception {
        return CONFLICT_COPY_PREFIX + sha256((record.optString("object_id") + "\n" + sourceDeviceId(record)).getBytes(StandardCharsets.UTF_8)).substring(0, 32);
    }

    static String copyVersionId(String deviceId, String copyNodeId, String sourceVersionId) throws Exception {
        return deviceId + "#" + copyNodeId + ":" + sha256(sourceVersionId.getBytes(StandardCharsets.UTF_8)).substring(0, 32);
    }

    static boolean isConflictCopyNodeId(String nodeId) {
        return nodeId != null && nodeId.startsWith(CONFLICT_COPY_PREFIX);
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : hash) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
