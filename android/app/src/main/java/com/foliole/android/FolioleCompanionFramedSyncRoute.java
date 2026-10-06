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
import java.io.BufferedInputStream;
import java.io.InputStream;
import java.io.OutputStream;
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
                    authenticatedPeer, senderEpoch, localDeviceId, localEpoch), bridge, nonceStore, new JSONObject()
                    .put("group_id", groupId).put("peer_device_id", authenticatedPeer)
                    .put("peer_library_epoch", senderEpoch))
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
        FolioleCompanionSyncGroupDataBridge bridge,
        FramedSyncSessionNonceStore nonceStore,
        JSONObject peerContext
    ) throws Exception {
        FramedSyncSessionReader.Result requestSession = FramedSyncSessionReader.read(
            input, groupKey, context, FramedSyncInventoryWire.MAX_SESSION_FRAMES);
        byte[] roundId = FramedSyncInventoryWire.decodeRoundId(requestSession.messages());
        JSONObject inventory = bridge.request("read_framed_inventory", peerContext);
        return FramedSyncSessionWriter.encode(groupKey, context, FramedSyncInventoryWire.encode(
            FolioleCompanionFramedSyncInventory.read(inventory), roundId), nonceStore);
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
            TransferReceipt receipt = FolioleCompanionFramedSyncApply.apply(
                bridge, store, received.transferId(), context, localDeviceId, localEpoch);
            return store.receipt(groupKey, receipt);
        }
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
