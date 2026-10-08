package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncHttpTransport;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.foliole.android.framed.FramedSyncInventoryWire;
import com.foliole.android.framed.FramedSyncInventoryReader;
import com.foliole.android.framed.FramedSyncSessionContext;
import com.foliole.android.framed.FramedSyncSessionNonceSQLite;
import com.foliole.android.framed.FramedSyncSessionReader;
import com.foliole.android.framed.FramedSyncSessionFile;
import com.foliole.sync.v22.InventoryEntry;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.net.URL;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncInventoryClient {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String PATH = "/companion/framed-sync";

    private FolioleCompanionFramedSyncInventoryClient() {}

    static JSObject read(Context context, PluginCall call) throws Exception {
        var budget = FramedSyncPayloadBudgetRegistry.current();
        String groupId = required(call, "sync_group_id");
        String endpointUrl = required(call, "endpoint_url");
        String receiverDeviceId = required(call, "receiver_device_id");
        String receiverEpoch = required(call, "receiver_library_epoch");
        FolioleCompanionCurrentGroupCredential credential =
            FolioleCompanionCurrentGroupCredential.load(groupId);
        FolioleCompanionSyncGroupDataBridge bridge = FolioleCompanionSyncGroupDataBridge.current();
        String senderEpoch = localEpoch(bridge, budget);
        List<InventoryEntry> localEntries = FolioleCompanionFramedSyncInventory.readLeased(bridge, new JSONObject(), budget);
        byte[] groupKey = groupKey(credential.workgroupKey);
        byte[] roundId = random(16);
        FramedSyncSessionContext sessionContext = new FramedSyncSessionContext(
            groupId, credential.deviceId, senderEpoch, receiverDeviceId, receiverEpoch);
        try (FramedSyncSessionNonceSQLite nonces = new FramedSyncSessionNonceSQLite(context);
             FramedSyncSessionFile request = FramedSyncSessionFile.create(context.getCacheDir(),
                groupKey, sessionContext,
                consumer -> FramedSyncInventoryWire.emit(localEntries, roundId, consumer), nonces, budget)) {
            String path = path(credential.deviceId, senderEpoch, receiverDeviceId, receiverEpoch);
            List<InventoryEntry> entries = FramedSyncHttpTransport.post(
                new URL(join(endpointUrl, path)), groupId, receiverDeviceId, receiverEpoch,
                FolioleCompanionSyncGroupSigning.framedHeaders(
                    credential, groupId, path, request.sha256()),
                request::replay,
                reader -> {
                    FramedSyncInventoryReader inventory = new FramedSyncInventoryReader(true);
                    FramedSyncSessionReader.readEach(reader.budgeted(budget,
                        FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD), groupKey, sessionContext,
                        FramedSyncInventoryWire.MAX_SESSION_FRAMES, inventory::accept);
                    return inventory.entries(roundId);
                });
            return json(entries, roundId);
        }
    }

    private static JSObject json(List<InventoryEntry> entries, byte[] roundId) {
        JSArray values = new JSArray();
        for (InventoryEntry entry : entries) values.put(new JSObject()
            .put("frontier_fact_ids", strings(entry.getFrontierFactIdsList()))
            .put("global_id", entry.getGlobalId())
            .put("object_type", entry.getObjectType())
            .put("required_relation_ids", strings(entry.getRequiredRelationIdsList()))
            .put("resource_hashes", hashes(entry.getResourceHashesList()))
            .put("review_fact_ids", strings(entry.getReviewFactIdsList()))
            .put("state_fact_ids", strings(entry.getStateFactIdsList()))
            .put("shared_state_hash", hex(entry.getSharedStateHash().toByteArray())));
        return new JSObject().put("entries", values).put("round_id", hex(roundId));
    }

    private static JSONArray strings(List<String> values) {
        JSONArray result = new JSONArray();
        for (String value : values) result.put(value);
        return result;
    }

    private static JSONArray hashes(List<com.google.protobuf.ByteString> values) {
        JSONArray result = new JSONArray();
        for (com.google.protobuf.ByteString value : values) result.put(hex(value.toByteArray()));
        return result;
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

    private static String localEpoch(FolioleCompanionSyncGroupDataBridge bridge, com.foliole.android.framed.FramedSyncPayloadBudget budget) throws Exception {
        String value = bridge.request(
            "load_member_state", new JSONObject(), budget).optString("library_epoch", null);
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

    private static byte[] random(int length) {
        byte[] result = new byte[length];
        RANDOM.nextBytes(result);
        return result;
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value.trim();
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", Byte.toUnsignedInt(item)));
        return result.toString();
    }
}
