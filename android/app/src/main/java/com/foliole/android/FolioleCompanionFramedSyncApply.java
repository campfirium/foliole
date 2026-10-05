package com.foliole.android;

import com.foliole.android.framed.FramedSyncResourcePublication;
import com.foliole.android.framed.FramedSyncTransferContext;
import com.foliole.android.framed.FramedSyncTransferSQLite;
import com.foliole.sync.v22.TransferReceipt;
import com.google.protobuf.ByteString;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncApply {
    private FolioleCompanionFramedSyncApply() {}

    static TransferReceipt apply(
        FolioleCompanionSyncGroupDataBridge bridge,
        FramedSyncTransferSQLite staging,
        byte[] transferId,
        FramedSyncTransferContext context,
        String localDeviceId,
        String localEpoch
    ) throws Exception {
        try (FramedSyncResourcePublication resources = staging.publishResources(transferId)) {
            JSONObject applied = bridge.request("apply_framed_transfer", new JSONObject()
                .put("staging_kind", "android").put("staging_path", staging.path())
                .put("transfer_id", hex(transferId))
                .put("sender_device_id", context.senderDeviceId())
                .put("sender_library_epoch", context.senderLibraryEpoch())
                .put("receiver_device_id", localDeviceId)
                .put("receiver_library_epoch", localEpoch)
                .put("resource_storage_keys", new JSONArray(resources.storageKeys())));
            TransferReceipt receipt = receipt(applied, transferId, localDeviceId, localEpoch);
            resources.commit();
            return receipt;
        }
    }

    private static TransferReceipt receipt(
        JSONObject value, byte[] transferId, String localDeviceId, String localEpoch
    ) {
        byte[] returnedTransferId = digest(value.optString("transfer_id"));
        if (!MessageDigest.isEqual(transferId, returnedTransferId) ||
            !localDeviceId.equals(value.optString("receiver_device_id")) ||
            !localEpoch.equals(value.optString("receiver_library_epoch"))) {
            throw new IllegalArgumentException("framed_sync_receipt_identity_mismatch");
        }
        return TransferReceipt.newBuilder().setTransferId(ByteString.copyFrom(returnedTransferId))
            .setContentId(ByteString.copyFrom(digest(value.optString("content_id"))))
            .setReceiverDeviceId(localDeviceId).setReceiverLibraryEpoch(localEpoch)
            .setAppliedStateHash(ByteString.copyFrom(digest(value.optString("applied_state_hash"))))
            .build();
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", item & 0xff));
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
}
