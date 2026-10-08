package com.foliole.android;

import com.foliole.android.framed.FramedSyncContract;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.sync.v22.InventoryEntry;
import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncInventory {
    private FolioleCompanionFramedSyncInventory() {}

    static List<InventoryEntry> readLeased(FolioleCompanionSyncGroupDataBridge bridge, JSONObject context,
        FramedSyncPayloadBudget budget) throws Exception {
        try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            return read(bridge.request("read_framed_inventory", new JSONObject(context.toString())
                .put("payload_loan", FolioleCompanionFramedSyncPayloadBudgetActions.description(loan)), budget));
        }
    }

    static List<InventoryEntry> read(JSONObject value) throws Exception {
        JSONArray encoded = value.getJSONArray("entries");
        if (encoded.length() > FramedSyncContract.MAX_INVENTORY_ENTRIES) {
            throw new IllegalArgumentException("inventory_entry_limit_exceeded");
        }
        List<InventoryEntry> result = new ArrayList<>();
        for (int index = 0; index < encoded.length(); index++) {
            JSONObject entry = encoded.getJSONObject(index);
            InventoryEntry.Builder builder = InventoryEntry.newBuilder()
                .setObjectType(required(entry, "object_type"))
                .setGlobalId(required(entry, "global_id"))
                .setSharedStateHash(ByteString.copyFrom(digest(entry.getString("shared_state_hash"))))
                .addAllFrontierFactIds(strings(entry.getJSONArray("frontier_fact_ids")))
                .addAllRequiredRelationIds(strings(entry.getJSONArray("required_relation_ids")))
                .addAllReviewFactIds(strings(entry.getJSONArray("review_fact_ids")))
                .addAllStateFactIds(strings(entry.getJSONArray("state_fact_ids")));
            JSONArray hashes = entry.getJSONArray("resource_hashes");
            for (int hash = 0; hash < hashes.length(); hash++) {
                builder.addResourceHashes(ByteString.copyFrom(digest(hashes.getString(hash))));
            }
            result.add(builder.build());
        }
        return result;
    }

    private static List<String> strings(JSONArray values) throws Exception {
        List<String> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            result.add(required(values.getString(index)));
        }
        return result;
    }

    private static String required(JSONObject value, String key) throws Exception {
        return required(value.getString(key));
    }

    private static String required(String value) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("inventory_identity_required");
        }
        return value.trim();
    }

    private static byte[] digest(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("framed_sync_inventory_digest_invalid");
        }
        byte[] result = new byte[32];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }
}
