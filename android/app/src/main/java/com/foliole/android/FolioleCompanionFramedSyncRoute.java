package com.foliole.android;

import android.util.Base64;
import com.foliole.android.framed.FramedSyncInventoryWire;
import com.foliole.android.framed.FramedSyncPreamble;
import com.foliole.android.framed.FramedSyncSessionContext;
import com.foliole.android.framed.FramedSyncSessionNonceStore;
import com.foliole.android.framed.FramedSyncSessionReader;
import com.foliole.android.framed.FramedSyncSessionWriter;
import com.foliole.android.framed.FramedSyncTransferContext;
import com.foliole.android.framed.FramedSyncTransferReader;
import com.foliole.android.framed.FramedSyncTransferSQLite;
import com.foliole.android.framed.FramedSyncValidationException;
import com.foliole.sync.v22.TransferReceipt;
import com.google.protobuf.ByteString;
import java.io.BufferedInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncRoute {
    private static final String CONTENT_TYPE = "application/vnd.foliole.framed-sync";

    private FolioleCompanionFramedSyncRoute() {}

    static void handle(
        JSONObject config,
        FolioleCompanionSyncGroupDataBridge bridge,
        FolioleCompanionSyncGroupSnapshot snapshots,
        FolioleCompanionHttpRequest request,
        OutputStream output,
        String authenticatedPeer,
        FramedSyncSessionNonceStore nonceStore,
        FramedSyncTransferSQLite transferStore
    ) throws Exception {
        if (!contentType(request)) {
            FolioleCompanionHttpResponse.json(
                output, 415, new JSONObject().put("error", "framed_sync_content_type_required"));
            return;
        }
        String groupId = config.getJSONObject("sync_group").getString("group_id");
        String localDeviceId = config.getString("device_id");
        String localEpoch = required(
            bridge.request("load_member_state", new JSONObject()).optString("library_epoch", null));
        Map<String, String> identity = identity(request.path);
        if (!authenticatedPeer.equals(identity.get("initiator_device_id"))) {
            throw new SecurityException("framed_sync_initiator_identity_mismatch");
        }
        if (!localDeviceId.equals(identity.get("responder_device_id")) ||
            !localEpoch.equals(identity.get("responder_library_epoch"))) {
            FolioleCompanionHttpResponse.json(
                output, 409, new JSONObject().put("error", "framed_sync_responder_identity_mismatch"));
            return;
        }
        String senderEpoch = identity.get("initiator_library_epoch");
        byte[] groupKey = groupKey(groupId);
        try {
            BufferedInputStream input = new BufferedInputStream(request.bodyStream(), FramedSyncPreamble.BYTES);
            FramedSyncPreamble preamble = peekPreamble(input);
            byte[] response = preamble.contextKind() == 1
                ? inventory(input, groupKey, new FramedSyncSessionContext(groupId,
                    authenticatedPeer, senderEpoch, localDeviceId, localEpoch), snapshots,
                    authenticatedPeer, nonceStore)
                : transfer(input, groupKey, new FramedSyncTransferContext(groupId,
                    authenticatedPeer, senderEpoch, localDeviceId, localEpoch), bridge,
                    transferStore, localDeviceId, localEpoch);
            FolioleCompanionHttpResponse.framed(output, response, localDeviceId, localEpoch);
        } catch (FramedSyncValidationException error) {
            throw new IllegalArgumentException(error.code());
        }
    }

    private static byte[] inventory(
        InputStream input,
        byte[] groupKey,
        FramedSyncSessionContext context,
        FolioleCompanionSyncGroupSnapshot snapshots,
        String peer,
        FramedSyncSessionNonceStore nonceStore
    ) throws Exception {
        FramedSyncSessionReader.Result requestSession = FramedSyncSessionReader.read(
            input, groupKey, context, FramedSyncInventoryWire.MAX_SESSION_FRAMES);
        byte[] roundId = FramedSyncInventoryWire.decodeRoundId(requestSession.messages());
        return snapshots.refresh(peer, snapshot -> FramedSyncSessionWriter.encode(
            groupKey, context, FramedSyncInventoryWire.encode(
                FolioleCompanionFramedSyncInventory.read(snapshot), roundId), nonceStore));
    }

    private static byte[] transfer(
        InputStream input,
        byte[] groupKey,
        FramedSyncTransferContext context,
        FolioleCompanionSyncGroupDataBridge bridge,
        FramedSyncTransferSQLite store,
        String localDeviceId,
        String localEpoch
    ) throws Exception {
        synchronized (store) {
            FramedSyncTransferReader.Result received = store.receive(input, groupKey, context);
            JSONObject applied = bridge.request("apply_framed_transfer", new JSONObject()
                .put("staging_kind", "android")
                .put("staging_path", store.path())
                .put("transfer_id", hex(received.transferId()))
                .put("sender_device_id", context.senderDeviceId())
                .put("sender_library_epoch", context.senderLibraryEpoch())
                .put("receiver_device_id", localDeviceId)
                .put("receiver_library_epoch", localEpoch));
            TransferReceipt receipt = receipt(applied, received.transferId(), localDeviceId, localEpoch);
            return store.receipt(groupKey, receipt);
        }
    }

    private static TransferReceipt receipt(
        JSONObject value,
        byte[] transferId,
        String localDeviceId,
        String localEpoch
    ) {
        byte[] returnedTransferId = digest(value.optString("transfer_id"));
        if (!MessageDigest.isEqual(transferId, returnedTransferId) ||
            !localDeviceId.equals(value.optString("receiver_device_id")) ||
            !localEpoch.equals(value.optString("receiver_library_epoch"))) {
            throw new IllegalArgumentException("framed_sync_receipt_identity_mismatch");
        }
        return TransferReceipt.newBuilder()
            .setTransferId(ByteString.copyFrom(returnedTransferId))
            .setContentId(ByteString.copyFrom(digest(value.optString("content_id"))))
            .setReceiverDeviceId(localDeviceId).setReceiverLibraryEpoch(localEpoch)
            .setAppliedStateHash(ByteString.copyFrom(digest(value.optString("applied_state_hash"))))
            .build();
    }

    private static FramedSyncPreamble peekPreamble(BufferedInputStream input) throws Exception {
        byte[] encoded = new byte[FramedSyncPreamble.BYTES];
        input.mark(encoded.length);
        int offset = 0;
        while (offset < encoded.length) {
            int count = input.read(encoded, offset, encoded.length - offset);
            if (count < 0) throw new IllegalArgumentException("framed_sync_preamble_truncated");
            offset += count;
        }
        input.reset();
        return FramedSyncPreamble.decode(encoded);
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", Byte.toUnsignedInt(item)));
        return result.toString();
    }

    private static byte[] digest(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("framed_sync_receipt_digest_invalid");
        }
        byte[] result = new byte[32];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }

    private static boolean contentType(FolioleCompanionHttpRequest request) {
        String value = request.header("content-type");
        return value != null && CONTENT_TYPE.equalsIgnoreCase(value.split(";", 2)[0].trim());
    }

    private static Map<String, String> identity(String path) throws Exception {
        Map<String, String> values = new HashMap<>();
        String query = path.contains("?") ? path.substring(path.indexOf('?') + 1) : "";
        for (String item : query.split("&")) {
            String[] pair = item.split("=", 2);
            if (pair.length == 2) values.put(pair[0], required(
                URLDecoder.decode(pair[1], "UTF-8").trim()));
        }
        for (String key : new String[] { "initiator_device_id", "initiator_library_epoch",
            "responder_device_id", "responder_library_epoch" }) {
            if (!values.containsKey(key)) {
                throw new IllegalArgumentException("framed_sync_identity_context_required");
            }
        }
        return values;
    }

    private static byte[] groupKey(String groupId) throws Exception {
        return Base64.decode(FolioleCompanionCurrentGroupCredential.load(groupId).workgroupKey,
            Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static String required(String value) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("framed_sync_identity_context_required");
        }
        return value.trim();
    }
}
