package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncHttpTransport;
import com.foliole.android.framed.FramedSyncOutboundSQLite;
import com.foliole.android.framed.FramedSyncReceiptReader;
import com.foliole.android.framed.FramedSyncTransferContext;
import com.foliole.android.framed.FramedSyncTransferWriter;
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
        String groupId = required(call, "sync_group_id");
        String endpointUrl = required(call, "endpoint_url");
        FolioleCompanionFramedSyncOutboundInput.Request input =
            FolioleCompanionFramedSyncOutboundInput.request(call);
        String receiverDeviceId = required(call, "receiver_device_id");
        String receiverEpoch = required(call, "receiver_library_epoch");
        FolioleCompanionCurrentGroupCredential credential =
            FolioleCompanionCurrentGroupCredential.load(groupId);
        String senderEpoch = requiredMemberState("library_epoch");
        FramedSyncTransferContext transferContext = new FramedSyncTransferContext(
            groupId, credential.deviceId, senderEpoch, receiverDeviceId, receiverEpoch);
        JSONObject selection = selection(groupId, input.objectId, input.includeCurrentNode,
            input.requiredRelationIds, input.reviewFactIds, input.stateFactIds, credential.deviceId, senderEpoch,
            receiverDeviceId, receiverEpoch);
        String publishedTransferId = call.getString("transfer_id");
        if (publishedTransferId != null) selection.put("transfer_id", publishedTransferId);
        JSONObject inspected = FolioleCompanionSyncGroupDataBridge.current().request(
            "inspect_framed_outbound", selection);
        JSONObject prepared = FolioleCompanionSyncGroupDataBridge.current().request(
            "prepare_framed_outbound", new JSONObject(selection.toString()).put("resource_files",
                FolioleCompanionFramedSyncResources.describe(context, inspected)));
        byte[] groupKey = decodeGroupKey(credential.workgroupKey);
        byte[] contentId = digest(prepared.getString("content_id"));
        requireSame(contentId, digest(prepared.getString("manifest_hash")),
            "framed_sync_manifest_identity_mismatch");
        byte[] expectedTransferId = digest(prepared.getString("transfer_id"));
        var facts = FolioleCompanionFramedSyncOutboundInput.facts(prepared);
        var blobs = FolioleCompanionFramedSyncOutboundInput.blobs(context, prepared, facts);

        try (FramedSyncOutboundSQLite staging = new FramedSyncOutboundSQLite(context)) {
            FramedSyncTransferWriter.Attempt replayable =
                staging.loadLatestReplayableAttempt(expectedTransferId);
            final FramedSyncTransferWriter.Attempt attempt = replayable != null ? replayable :
                FramedSyncTransferWriter.prepare(groupKey, transferContext, facts, blobs, staging);
            requireSame(expectedTransferId, attempt.transferId(), "framed_sync_transfer_identity_mismatch");
            String path = path(credential.deviceId, senderEpoch, receiverDeviceId, receiverEpoch);
            Map<String, String> headers = signedHeaders(
                credential, groupId, path, bodySha256(attempt, staging));
            TransferReceipt receipt = FramedSyncHttpTransport.post(
                new URL(join(endpointUrl, path)), groupId, receiverDeviceId, receiverEpoch, headers,
                writer -> FramedSyncTransferWriter.replay(attempt, staging, writer),
                reader -> FramedSyncReceiptReader.read(reader, groupKey, attempt.transferId(),
                    contentId, receiverDeviceId, receiverEpoch));
            complete(receipt);
            return result(receipt);
        }
    }

    private static JSONObject selection(
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

    private static void complete(TransferReceipt receipt) throws Exception {
        FolioleCompanionSyncGroupDataBridge.current().request(
            "complete_framed_outbound", new JSONObject()
                .put("applied_state_hash", hex(receipt.getAppliedStateHash().toByteArray()))
                .put("content_id", hex(receipt.getContentId().toByteArray()))
                .put("receiver_device_id", receipt.getReceiverDeviceId())
                .put("receiver_library_epoch", receipt.getReceiverLibraryEpoch())
                .put("transfer_id", hex(receipt.getTransferId().toByteArray())));
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

    private static OutputStream discardingOutput() {
        return new OutputStream() {
            @Override public void write(int value) {}
            @Override public void write(byte[] value, int offset, int length) {}
        };
    }

    private static JSObject result(TransferReceipt receipt) {
        return new JSObject()
            .put("applied_state_hash", hex(receipt.getAppliedStateHash().toByteArray()))
            .put("content_id", hex(receipt.getContentId().toByteArray()))
            .put("receiver_device_id", receipt.getReceiverDeviceId())
            .put("receiver_library_epoch", receipt.getReceiverLibraryEpoch())
            .put("transfer_id", hex(receipt.getTransferId().toByteArray()));
    }

    private static String path(
        String senderDeviceId, String senderEpoch, String receiverDeviceId, String receiverEpoch
    ) throws Exception {
        return PATH + "?initiator_device_id=" + encode(senderDeviceId) +
            "&initiator_library_epoch=" + encode(senderEpoch) +
            "&responder_device_id=" + encode(receiverDeviceId) +
            "&responder_library_epoch=" + encode(receiverEpoch);
    }

    private static String join(String endpointUrl, String path) {
        return endpointUrl.replaceAll("/+$", "") + path;
    }

    private static String encode(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8");
    }

    private static String requiredMemberState(String key) throws Exception {
        String value = FolioleCompanionSyncGroupDataBridge.current().request(
            "load_member_state", new JSONObject()).optString(key, null);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }


    private static byte[] decodeGroupKey(String value) {
        byte[] result = Base64.decode(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        if (result.length != 32) throw new SecurityException("sync_group_key_invalid");
        return result;
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

    private static void requireSame(byte[] expected, byte[] actual, String error) {
        if (!MessageDigest.isEqual(expected, actual)) throw new IllegalArgumentException(error);
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", Byte.toUnsignedInt(item)));
        return result.toString();
    }
}
