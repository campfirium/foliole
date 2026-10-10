package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncHttpTransport;
import com.foliole.android.framed.FramedSyncOutboundSQLite;
import com.foliole.android.framed.FramedSyncReceiptReader;
import com.foliole.android.framed.FramedSyncTransferContext;
import com.foliole.android.framed.FramedSyncTransferWriter;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.foliole.sync.v22.TransferReceipt;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLEncoder;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncOutbound {
    private static final String PATH = "/companion/framed-sync";

    private FolioleCompanionFramedSyncOutbound() {}

    static JSObject send(Context context, PluginCall call) throws Exception {
        FramedSyncPayloadBudget budget = FramedSyncPayloadBudgetRegistry.current();
        String groupId = required(call, "sync_group_id");
        String endpointUrl = required(call, "endpoint_url");
        FolioleCompanionFramedSyncOutboundInput.Request input =
            FolioleCompanionFramedSyncOutboundInput.request(call);
        String receiverDeviceId = required(call, "receiver_device_id");
        String receiverEpoch = required(call, "receiver_library_epoch");
        FolioleCompanionCurrentGroupCredential credential =
            FolioleCompanionCurrentGroupCredential.load(groupId);
        String senderEpoch = requiredMemberState("library_epoch", budget);
        FramedSyncTransferContext transferContext = new FramedSyncTransferContext(
            groupId, credential.deviceId, senderEpoch, receiverDeviceId, receiverEpoch);
        JSONObject selection = selection(groupId, input.objectId, input.includeCurrentNode,
            input.requiredRelationIds, input.reviewFactIds, input.stateFactIds, credential.deviceId, senderEpoch,
            receiverDeviceId, receiverEpoch);
        selection.put("object_type", call.getString("object_type"));
        if (call.getArray("frontier_fact_ids") != null) selection.put("frontier_fact_ids", call.getArray("frontier_fact_ids"));
        String publishedTransferId = call.getString("transfer_id");
        if (publishedTransferId != null) selection.put("transfer_id", publishedTransferId);
        var prepared = FolioleCompanionFramedSyncPreparedOutbound.load(context,
            FolioleCompanionSyncGroupDataBridge.current(), selection, budget);
        return sendPrepared(context, credential, transferContext, endpointUrl, selection,
            prepared.metadata, prepared.source, budget);
    }

    private static JSObject sendPrepared(Context context, FolioleCompanionCurrentGroupCredential credential,
        FramedSyncTransferContext transferContext, String endpointUrl, JSONObject selection,
        JSONObject prepared, FolioleCompanionFramedSyncOutboundSource source, FramedSyncPayloadBudget budget) throws Exception {
        String groupId = selection.getString("group_id");
        String senderEpoch = selection.getString("sender_library_epoch");
        String receiverDeviceId = selection.getString("receiver_device_id");
        String receiverEpoch = selection.getString("receiver_library_epoch");
        byte[] groupKey = decodeGroupKey(credential.workgroupKey);
        byte[] contentId = digest(prepared.getString("content_id"));
        requireSame(contentId, digest(prepared.getString("manifest_hash")),
            "framed_sync_manifest_identity_mismatch");
        byte[] expectedTransferId = digest(prepared.getString("transfer_id"));
        try (FramedSyncOutboundSQLite staging = new FramedSyncOutboundSQLite(context, budget)) {
            try {
                var attempt = FolioleCompanionFramedSyncAttempt.prepare(context, selection, prepared, source,
                    groupKey, transferContext, staging, budget);
                String path = path(credential.deviceId, senderEpoch, receiverDeviceId, receiverEpoch);
                Map<String, String> headers = signedHeaders(
                    credential, groupId, path, bodySha256(attempt, staging));
                TransferReceipt receipt = FramedSyncHttpTransport.post(
                    new URL(join(endpointUrl, path)), groupId, receiverDeviceId, receiverEpoch, headers,
                    writer -> FramedSyncTransferWriter.replay(attempt, staging, writer),
                    reader -> FramedSyncReceiptReader.read(reader, groupKey, attempt.transferId(),
                        contentId, receiverDeviceId, receiverEpoch, budget));
                complete(receipt, budget);
                return result(receipt);
            } finally { staging.discardOutboundAttempts(expectedTransferId); }
        }
    }

    static JSONObject selection(
        String groupId, String objectId, boolean includeCurrentNode,
        List<String> requiredRelationIds, List<String> reviewFactIds, List<String> stateFactIds,
        String senderDeviceId, String senderEpoch,
        String receiverDeviceId, String receiverEpoch
    ) throws Exception {
        return new JSONObject()
                .put("group_id", groupId).put("object_id", objectId)
                .put("include_current_node", includeCurrentNode)
                .put("required_relation_ids", new JSONArray(requiredRelationIds))
                .put("review_fact_ids", new JSONArray(reviewFactIds))
                .put("state_fact_ids", new JSONArray(stateFactIds))
                .put("sender_device_id", senderDeviceId).put("sender_library_epoch", senderEpoch)
                .put("receiver_device_id", receiverDeviceId)
                .put("receiver_library_epoch", receiverEpoch);
    }

    static void complete(TransferReceipt receipt, FramedSyncPayloadBudget budget) throws Exception {
        FolioleCompanionSyncGroupDataBridge.current().request(
            "complete_framed_outbound", new JSONObject()
                .put("applied_state_hash", hex(receipt.getAppliedStateHash().toByteArray()))
                .put("content_id", hex(receipt.getContentId().toByteArray()))
                .put("receiver_device_id", receipt.getReceiverDeviceId())
                .put("receiver_library_epoch", receipt.getReceiverLibraryEpoch())
                .put("transfer_id", hex(receipt.getTransferId().toByteArray())), budget);
    }

    private static Map<String, String> signedHeaders(
        FolioleCompanionCurrentGroupCredential credential,
        String groupId,
        String path,
        String bodySha256
    ) throws Exception {
        return FolioleCompanionSyncGroupSigning.framedHeaders(
            credential, groupId, path, bodySha256);
    }

    private static String bodySha256(
        FramedSyncTransferWriter.Attempt attempt,
        FramedSyncOutboundSQLite staging
    ) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (DigestOutputStream output = new DigestOutputStream(discardingOutput(), digest)) {
            FramedSyncTransferWriter.replay(attempt, staging, output);
        }
        return hex(digest.digest());
    }

    static OutputStream discardingOutput() {
        return new OutputStream() {
            @Override public void write(int value) {}
            @Override public void write(byte[] value, int offset, int length) {}
        };
    }

    static JSObject result(TransferReceipt receipt) {
        return new JSObject()
            .put("applied_state_hash", hex(receipt.getAppliedStateHash().toByteArray()))
            .put("content_id", hex(receipt.getContentId().toByteArray()))
            .put("receiver_device_id", receipt.getReceiverDeviceId())
            .put("receiver_library_epoch", receipt.getReceiverLibraryEpoch())
            .put("transfer_id", hex(receipt.getTransferId().toByteArray()));
    }

    static String path(
        String senderDeviceId, String senderEpoch, String receiverDeviceId, String receiverEpoch
    ) throws Exception {
        return PATH + "?initiator_device_id=" + encode(senderDeviceId) +
            "&initiator_library_epoch=" + encode(senderEpoch) +
            "&responder_device_id=" + encode(receiverDeviceId) +
            "&responder_library_epoch=" + encode(receiverEpoch);
    }

    static String join(String endpointUrl, String path) {
        return endpointUrl.replaceAll("/+$", "") + path;
    }

    private static String encode(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8");
    }

    static String requiredMemberState(String key, FramedSyncPayloadBudget budget) throws Exception {
        String value = FolioleCompanionSyncGroupDataBridge.current().request(
            "load_member_state", new JSONObject(), budget).optString(key, null);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }


    static byte[] decodeGroupKey(String value) {
        byte[] result = Base64.decode(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        if (result.length != 32) throw new SecurityException("sync_group_key_invalid");
        return result;
    }

    static byte[] digest(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("framed_sync_digest_invalid");
        }
        byte[] result = new byte[32];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }

    static void requireSame(byte[] expected, byte[] actual, String error) {
        if (!MessageDigest.isEqual(expected, actual)) throw new IllegalArgumentException(error);
    }

    static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", Byte.toUnsignedInt(item)));
        return result.toString();
    }
}
