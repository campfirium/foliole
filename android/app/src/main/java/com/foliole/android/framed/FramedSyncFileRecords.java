package com.foliole.android.framed;

import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/** The shared file format consumed by the TypeScript staging contract. */
final class FramedSyncFileRecords {
    private FramedSyncFileRecords() {}

    static JSONArray bytes(byte[] value) {
        JSONArray result = new JSONArray();
        for (byte item : value) result.put(item & 255);
        return result;
    }

    static byte[] bytes(JSONArray value) throws Exception {
        byte[] result = new byte[value.length()];
        for (int index = 0; index < result.length; index++) {
            int item = value.getInt(index);
            if (item < 0 || item > 255) throw new IllegalArgumentException("framed_sync_file_bytes_invalid");
            result[index] = (byte) item;
        }
        return result;
    }

    static JSONObject read(FramedSyncFiles files, String key) throws Exception {
        byte[] value = files.read(key);
        return value == null ? null : new JSONObject(new String(value, StandardCharsets.UTF_8));
    }

    static void write(FramedSyncFiles files, String key, JSONObject value) throws Exception {
        files.write(key, value.toString().getBytes(StandardCharsets.UTF_8));
    }

    static boolean same(Object left, Object right) throws Exception {
        if (left instanceof JSONObject && right instanceof JSONObject) {
            JSONObject a = (JSONObject) left;
            JSONObject b = (JSONObject) right;
            if (a.length() != b.length()) return false;
            for (var keys = a.keys(); keys.hasNext();) {
                String key = keys.next();
                if (!b.has(key) || !same(a.get(key), b.get(key))) return false;
            }
            return true;
        }
        if (left instanceof JSONArray && right instanceof JSONArray) {
            JSONArray a = (JSONArray) left;
            JSONArray b = (JSONArray) right;
            if (a.length() != b.length()) return false;
            for (int index = 0; index < a.length(); index++) if (!same(a.get(index), b.get(index))) return false;
            return true;
        }
        return left.equals(right);
    }

    static String directory(byte[] transferId) {
        if (transferId.length != 32) throw new IllegalArgumentException("framed_sync_transfer_id_invalid");
        return "inbound/" + FramedSyncResourceFiles.hex(transferId);
    }

    static String attempt(byte[] transferId, byte[] attemptId) {
        if (attemptId.length != 16) throw new IllegalArgumentException("framed_sync_attempt_id_invalid");
        return directory(transferId) + "/" + FramedSyncResourceFiles.hex(attemptId);
    }

    static JSONObject proposal(TransferProposal value, FramedSyncTransferContext context) throws Exception {
        JSONObject identity = new JSONObject().put("protocolVersion", FramedSyncContract.PROTOCOL_VERSION)
            .put("groupId", context.groupId()).put("senderDeviceId", value.getSenderDeviceId())
            .put("senderLibraryEpoch", value.getSenderLibraryEpoch())
            .put("receiverDeviceId", value.getReceiverDeviceId())
            .put("receiverLibraryEpoch", value.getReceiverLibraryEpoch());
        return new JSONObject().put("context", identity).put("transferId", bytes(value.getTransferId().toByteArray()))
            .put("contentId", bytes(value.getContentId().toByteArray()))
            .put("factCount", Long.toUnsignedString(value.getFactCount()))
            .put("blobCount", Long.toUnsignedString(value.getBlobCount()))
            .put("totalBlobBytes", Long.toUnsignedString(value.getTotalBlobBytes()));
    }

    static JSONObject blob(BlobReference value) throws Exception {
        return new JSONObject().put("sha256", bytes(value.getSha256().toByteArray()))
            .put("byteLength", Long.toUnsignedString(value.getByteLength()))
            .put("role", value.getRoleValue()).put("required", value.getRequired());
    }

    static JSONObject header(TransferHeader value, JSONObject proposal, String reservation) throws Exception {
        JSONArray blobs = new JSONArray();
        for (var item : value.getManifest().getBlobsList()) blobs.put(blob(item));
        JSONArray facts = new JSONArray();
        for (var item : value.getManifest().getFactsList()) {
            var identity = item.getIdentity();
            JSONArray required = new JSONArray();
            for (var hash : item.getRequiredBlobHashesList()) required.put(bytes(hash.toByteArray()));
            facts.put(new JSONObject().put("factId", identity.getFactId()).put("globalId", identity.getGlobalId())
                .put("objectType", identity.getObjectType()).put("kind", identity.getKindValue())
                .put("sharedStateHash", bytes(item.getSharedStateHash().toByteArray()))
                .put("requiredBlobHashes", required));
        }
        JSONObject published = new JSONObject(proposal.toString())
            .put("manifestHash", bytes(value.getManifest().getContentId().toByteArray()));
        return new JSONObject().put("attemptId", bytes(value.getAttemptId().toByteArray()))
            .put("proposal", proposal).put("published", published).put("reservationId", reservation)
            .put("blobs", blobs).put("facts", facts);
    }

    static JSONObject receipt(TransferReceipt value) throws Exception {
        return new JSONObject().put("transferId", bytes(value.getTransferId().toByteArray()))
            .put("contentId", bytes(value.getContentId().toByteArray()))
            .put("receiverDeviceId", value.getReceiverDeviceId())
            .put("receiverLibraryEpoch", value.getReceiverLibraryEpoch())
            .put("appliedStateHash", bytes(value.getAppliedStateHash().toByteArray()));
    }
}
