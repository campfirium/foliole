package com.foliole.android;

import com.foliole.android.framed.FramedSyncTransferSequence;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Parse the original per-transfer selectors under one unchanged authenticated request context. */
final class FolioleCompanionFramedSyncBatchInput {
    private FolioleCompanionFramedSyncBatchInput() {}
    static List<JSONObject> selections(PluginCall call, String sender, String senderEpoch) throws Exception {
        JSONArray transfers = call.getArray("transfers");
        List<JSONObject> result = new ArrayList<>();
        for (int index = 0; index < transfers.length(); index++) {
            JSONObject item = transfers.getJSONObject(index);
            Object include = item.opt("include_current_node");
            if (!(include instanceof Boolean)) throw new IllegalArgumentException("include_current_node_required");
            JSONObject selection = FolioleCompanionFramedSyncOutbound.selection(required(call, "sync_group_id"),
                required(item, "object_id"), (Boolean) include, strings(item, "required_relation_ids"),
                strings(item, "review_fact_ids"), strings(item, "state_fact_ids"), sender, senderEpoch,
                required(call, "receiver_device_id"), required(call, "receiver_library_epoch"));
            selection.put("object_type", required(item, "object_type"));
            if (item.has("frontier_fact_ids")) selection.put("frontier_fact_ids", strings(item, "frontier_fact_ids"));
            if (item.has("transfer_id")) selection.put("transfer_id", required(item, "transfer_id"));
            result.add(selection);
        }
        return result;
    }
    static void validate(PluginCall call) {
        String encoded = call.getData().toString();
        if (encoded.length() > 768 * 1024 || encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 768 * 1024) {
            throw new IllegalArgumentException("framed_sync_control_message_limit_exceeded");
        }
        JSONArray transfers = call.getArray("transfers");
        if (transfers == null || transfers.length() < 1 || transfers.length() > FramedSyncTransferSequence.MAX_ITEMS) {
            throw new IllegalArgumentException("framed_sync_batch_item_limit_exceeded");
        }
    }
    static String required(PluginCall call, String key) { return required(call.getData(), key); }
    static String required(JSONObject value, String key) {
        Object raw = value.opt(key);
        if (!(raw instanceof String) || ((String) raw).trim().isEmpty()) throw new IllegalArgumentException(key + "_required");
        return ((String) raw).trim();
    }
    private static List<String> strings(JSONObject value, String key) throws Exception {
        JSONArray values = value.getJSONArray(key);
        List<String> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            Object raw = values.get(index);
            if (!(raw instanceof String) || ((String) raw).trim().isEmpty() || result.contains(((String) raw).trim())) {
                throw new IllegalArgumentException(key + "_invalid");
            }
            result.add(((String) raw).trim());
        }
        return result;
    }
}
