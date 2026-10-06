package com.foliole.android;

import com.foliole.android.framed.FramedSyncCodec;
import com.foliole.android.framed.FramedSyncFrameType;
import com.foliole.android.framed.FramedSyncValidatedMessage;
import com.foliole.sync.v22.DifferenceRequest;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.ProtocolMessage;
import com.getcapacitor.PluginCall;
import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;

final class FolioleCompanionFramedSyncPullInput {
    private FolioleCompanionFramedSyncPullInput() {}

    static Request request(PluginCall call) throws Exception {
        return new Request(
            required(call, "object_id"), required(call, "object_type"),
            fixedHex(call, "round_id", 16),
            requiredStrings(call, "frontier_fact_ids"),
            requiredStrings(call, "required_relation_ids"),
            digestList(call, "resource_hashes"),
            requiredStrings(call, "review_fact_ids"), requiredStrings(call, "state_fact_ids"));
    }

    static List<FramedSyncValidatedMessage> messages(Request input) throws Exception {
        DifferenceRequest.Builder difference = DifferenceRequest.newBuilder()
            .setRoundId(ByteString.copyFrom(input.roundId));
        addFacts(difference, input.objectType, input.objectId, input.frontierFactIds, FactKind.FACT_KIND_NODE_VERSION);
        addFacts(difference, input.objectType, input.objectId, input.requiredRelationIds, FactKind.FACT_KIND_PARENT_EDGE);
        addFacts(difference, input.objectType, input.objectId, input.reviewFactIds, FactKind.FACT_KIND_REVIEW);
        addFacts(difference, input.objectType, input.objectId, input.stateFactIds, FactKind.FACT_KIND_OBJECT_STATE);
        for (byte[] hash : input.resourceHashes) difference.addBlobHashes(ByteString.copyFrom(hash));
        FramedSyncValidatedMessage message = FramedSyncCodec.validateOutbound(
            ProtocolMessage.newBuilder().setDifferenceRequest(difference).build(),
            FramedSyncFrameType.SESSION_CONTROL.wireValue());
        return Collections.singletonList(message);
    }

    private static void addFacts(
        DifferenceRequest.Builder request,
        String objectType, String objectId,
        List<String> factIds,
        FactKind kind
    ) {
        for (String factId : factIds) request.addFacts(FactIdentity.newBuilder()
            .setKind(kind).setObjectType(objectType).setGlobalId(objectId).setFactId(factId));
    }

    private static List<byte[]> digestList(PluginCall call, String key) throws Exception {
        JSONArray values = requiredArray(call, key);
        List<byte[]> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            byte[] value = decodeHex(values.getString(index).trim(), 32, key + "_invalid");
            for (byte[] existing : result) {
                if (java.security.MessageDigest.isEqual(existing, value)) {
                    throw new IllegalArgumentException(key + "_invalid");
                }
            }
            result.add(value);
        }
        return result;
    }

    private static List<String> requiredStrings(PluginCall call, String key) throws Exception {
        JSONArray values = requiredArray(call, key);
        List<String> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            String value = values.getString(index).trim();
            if (value.isEmpty() || result.contains(value)) {
                throw new IllegalArgumentException(key + "_invalid");
            }
            result.add(value);
        }
        return result;
    }

    private static JSONArray requiredArray(PluginCall call, String key) {
        JSONArray values = call.getArray(key);
        if (values == null) throw new IllegalArgumentException(key + "_required");
        return values;
    }

    private static byte[] fixedHex(PluginCall call, String key, int bytes) {
        return decodeHex(required(call, key), bytes, key + "_invalid");
    }

    private static byte[] decodeHex(String value, int bytes, String error) {
        if (value == null || !value.matches("[a-f0-9]{" + (bytes * 2) + "}")) {
            throw new IllegalArgumentException(error);
        }
        byte[] result = new byte[bytes];
        for (int index = 0; index < bytes; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(key + "_required");
        }
        return value.trim();
    }

    static final class Request {
        final List<String> frontierFactIds;
        final String objectId;
        final String objectType;
        final List<String> requiredRelationIds;
        final List<byte[]> resourceHashes;
        final List<String> reviewFactIds;
        final List<String> stateFactIds;
        final byte[] roundId;

        Request(
            String objectId, String objectType,
            byte[] roundId,
            List<String> frontierFactIds,
            List<String> requiredRelationIds,
            List<byte[]> resourceHashes,
            List<String> reviewFactIds, List<String> stateFactIds
        ) {
            this.objectId = objectId;
            this.objectType = objectType;
            this.roundId = roundId.clone();
            this.frontierFactIds = new ArrayList<>(frontierFactIds);
            this.requiredRelationIds = new ArrayList<>(requiredRelationIds);
            this.resourceHashes = new ArrayList<>(resourceHashes);
            this.reviewFactIds = new ArrayList<>(reviewFactIds);
            this.stateFactIds = new ArrayList<>(stateFactIds);
        }
    }
}
