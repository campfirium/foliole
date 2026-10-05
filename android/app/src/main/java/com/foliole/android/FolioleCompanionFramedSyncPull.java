package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncHttpTransport;
import com.foliole.android.framed.FramedSyncSessionContext;
import com.foliole.android.framed.FramedSyncSessionNonceSQLite;
import com.foliole.android.framed.FramedSyncSessionWriter;
import com.foliole.android.framed.FramedSyncTransferContext;
import com.foliole.android.framed.FramedSyncTransferReader;
import com.foliole.android.framed.FramedSyncTransferSQLite;
import com.foliole.sync.v22.TransferReceipt;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.Map;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncPull {
    private static final String PATH = "/companion/framed-sync";

    private FolioleCompanionFramedSyncPull() {}

    static JSObject pull(Context context, PluginCall call) throws Exception {
        String groupId = required(call, "sync_group_id");
        String endpointUrl = required(call, "endpoint_url");
        String remoteDeviceId = required(call, "receiver_device_id");
        String remoteEpoch = required(call, "receiver_library_epoch");
        FolioleCompanionFramedSyncPullInput.Request input =
            FolioleCompanionFramedSyncPullInput.request(call);
        FolioleCompanionCurrentGroupCredential credential =
            FolioleCompanionCurrentGroupCredential.load(groupId);
        FolioleCompanionSyncGroupDataBridge bridge = FolioleCompanionSyncGroupDataBridge.current();
        String localEpoch = localEpoch(bridge);
        byte[] groupKey = groupKey(credential.workgroupKey);
        FramedSyncSessionContext sessionContext = new FramedSyncSessionContext(
            groupId, credential.deviceId, localEpoch, remoteDeviceId, remoteEpoch);
        byte[] request;
        try (FramedSyncSessionNonceSQLite nonces = new FramedSyncSessionNonceSQLite(context)) {
            request = FramedSyncSessionWriter.encode(groupKey, sessionContext,
                FolioleCompanionFramedSyncPullInput.messages(input), nonces);
        }
        String path = path(credential.deviceId, localEpoch, remoteDeviceId, remoteEpoch);
        URL url = new URL(join(endpointUrl, path));
        FramedSyncTransferContext transferContext = new FramedSyncTransferContext(
            groupId, remoteDeviceId, remoteEpoch, credential.deviceId, localEpoch);
        try (FramedSyncTransferSQLite staging = new FramedSyncTransferSQLite(context)) {
            FramedSyncTransferReader.Result received = FramedSyncHttpTransport.postStream(
                url, groupId, remoteDeviceId, remoteEpoch,
                signedHeaders(credential, groupId, path, request),
                writer -> FramedSyncSessionWriter.replay(request, writer),
                response -> staging.receive(response, groupKey, transferContext));
            TransferReceipt receipt = FolioleCompanionFramedSyncApply.apply(
                bridge, staging, received.transferId(), transferContext, credential.deviceId, localEpoch);
            byte[] encodedReceipt = staging.receipt(groupKey, receipt);
            FramedSyncHttpTransport.postNoResponse(
                url, groupId, remoteDeviceId, remoteEpoch,
                signedHeaders(credential, groupId, path, encodedReceipt),
                writer -> FramedSyncSessionWriter.replay(encodedReceipt, writer));
            return result(receipt);
        }
    }

    private static JSObject result(TransferReceipt receipt) {
        return new JSObject()
            .put("applied_state_hash", hex(receipt.getAppliedStateHash().toByteArray()))
            .put("content_id", hex(receipt.getContentId().toByteArray()))
            .put("receiver_device_id", receipt.getReceiverDeviceId())
            .put("receiver_library_epoch", receipt.getReceiverLibraryEpoch())
            .put("transfer_id", hex(receipt.getTransferId().toByteArray()));
    }

    private static Map<String, String> signedHeaders(
        FolioleCompanionCurrentGroupCredential credential,
        String groupId,
        String path,
        byte[] body
    ) throws Exception {
        return FolioleCompanionSyncGroupSigning.framedHeaders(
            credential, groupId, path, sha256(body));
    }

    private static String path(
        String localDeviceId, String localEpoch, String remoteDeviceId, String remoteEpoch
    ) throws Exception {
        return PATH + "?initiator_device_id=" + encode(localDeviceId) +
            "&initiator_library_epoch=" + encode(localEpoch) +
            "&responder_device_id=" + encode(remoteDeviceId) +
            "&responder_library_epoch=" + encode(remoteEpoch);
    }

    private static String localEpoch(FolioleCompanionSyncGroupDataBridge bridge) throws Exception {
        String value = bridge.request(
            "load_member_state", new JSONObject()).optString("library_epoch", null);
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("library_epoch_required");
        }
        return value.trim();
    }

    private static byte[] groupKey(String value) {
        byte[] result = Base64.decode(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        if (result.length != 32) throw new SecurityException("sync_group_key_invalid");
        return result;
    }

    private static String sha256(byte[] value) throws Exception {
        return hex(MessageDigest.getInstance("SHA-256").digest(value));
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }

    private static String encode(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8");
    }

    private static String join(String endpointUrl, String path) {
        return endpointUrl.replaceAll("/+$", "") + path;
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", Byte.toUnsignedInt(item)));
        return result.toString();
    }
}
