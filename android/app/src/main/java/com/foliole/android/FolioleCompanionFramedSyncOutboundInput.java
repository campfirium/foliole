package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.FramedSyncCodec;
import com.foliole.android.framed.FramedSyncBlobContent;
import com.foliole.android.framed.FramedSyncFrameType;
import com.foliole.sync.v22.FactRecord;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncOutboundInput {
    private FolioleCompanionFramedSyncOutboundInput() {}

    static Request request(PluginCall call) throws Exception {
        return new Request(required(call, "object_id"), requiredBoolean(call, "include_current_node"),
            requiredStrings(call, "required_relation_ids"), requiredStrings(call, "review_fact_ids"));
    }

    static List<FactRecord> facts(JSONObject prepared) throws Exception {
        JSONArray encoded = prepared.getJSONArray("fact_message_bytes_list");
        if (encoded.length() == 0) throw new IllegalArgumentException("framed_sync_fact_set_invalid");
        List<FactRecord> result = new ArrayList<>();
        for (int index = 0; index < encoded.length(); index++) {
            JSONArray message = encoded.getJSONArray(index);
            byte[] bytes = new byte[message.length()];
            for (int offset = 0; offset < message.length(); offset++) {
                Object raw = message.get(offset);
                if (!(raw instanceof Number) || ((Number) raw).doubleValue() !=
                    ((Number) raw).intValue() || ((Number) raw).intValue() < 0 ||
                    ((Number) raw).intValue() > 255) {
                    throw new IllegalArgumentException("framed_sync_fact_bytes_invalid");
                }
                bytes[offset] = (byte) ((Number) raw).intValue();
            }
            result.add((FactRecord) FramedSyncCodec.decode(
                bytes, FramedSyncFrameType.FACT.wireValue()).payload().value());
        }
        return result;
    }

    static List<FramedSyncBlobContent> blobs(
        Context context,
        JSONObject prepared,
        List<FactRecord> facts
    ) throws Exception {
        JSONArray encoded = prepared.getJSONArray("blobs");
        List<FramedSyncBlobContent> result = new ArrayList<>();
        for (int index = 0; index < encoded.length(); index++) {
            JSONObject blob = encoded.getJSONObject(index);
            byte[] hash = digest(blob.getString("sha256"));
            String lengthText = blob.getString("byte_length");
            long length = Long.parseUnsignedLong(lengthText);
            Object roleValue = blob.get("role");
            Object requiredValue = blob.get("required");
            if (!Long.toUnsignedString(length).equals(lengthText) ||
                !(roleValue instanceof Number) || ((Number) roleValue).doubleValue() !=
                    ((Number) roleValue).intValue() || !(requiredValue instanceof Boolean) ||
                !descriptorMatches(facts, hash, length, ((Number) roleValue).intValue(),
                    (Boolean) requiredValue)) {
                throw new IllegalArgumentException("framed_sync_blob_content_mismatch");
            }
            int role = ((Number) roleValue).intValue();
            if (role == 1) {
                byte[] data = blob.getString("data_text").getBytes(StandardCharsets.UTF_8);
                if (length != data.length) throw new IllegalArgumentException("framed_sync_blob_content_mismatch");
                result.add(new FramedSyncBlobContent(hash, data));
            } else {
                File file = FolioleCompanionFramedSyncResources.resolveFile(
                    context, blob.getString("storage_key"));
                if (file.length() != length) throw new IllegalArgumentException("framed_sync_blob_content_mismatch");
                result.add(FramedSyncBlobContent.file(hash, file));
            }
        }
        return result;
    }

    private static boolean descriptorMatches(
        List<FactRecord> facts, byte[] hash, long length, int role, boolean required
    ) {
        for (FactRecord fact : facts) for (var blob : fact.getBlobsList()) {
            if (MessageDigest.isEqual(hash, blob.getSha256().toByteArray()) &&
                length == blob.getByteLength() && role == blob.getRoleValue() &&
                required == blob.getRequired()) return true;
        }
        return false;
    }

    private static byte[] digest(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("framed_sync_digest_invalid");
        }
        byte[] result = new byte[32];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }

    private static boolean requiredBoolean(PluginCall call, String key) {
        if (!call.getData().has(key)) throw new IllegalArgumentException(key + "_required");
        return call.getBoolean(key, false);
    }

    private static List<String> requiredStrings(PluginCall call, String key) throws Exception {
        JSONArray values = call.getArray(key);
        if (values == null) throw new IllegalArgumentException(key + "_required");
        List<String> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            String value = values.getString(index).trim();
            if (value.isEmpty() || result.contains(value)) throw new IllegalArgumentException(key + "_invalid");
            result.add(value);
        }
        return result;
    }

    static final class Request {
        final boolean includeCurrentNode;
        final String objectId;
        final List<String> requiredRelationIds;
        final List<String> reviewFactIds;

        Request(
            String objectId, boolean includeCurrentNode,
            List<String> requiredRelationIds, List<String> reviewFactIds
        ) {
            this.objectId = objectId;
            this.includeCurrentNode = includeCurrentNode;
            this.requiredRelationIds = requiredRelationIds;
            this.reviewFactIds = reviewFactIds;
        }
    }
}
