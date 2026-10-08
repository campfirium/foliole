package com.foliole.android;

import com.foliole.android.framed.FramedSyncContract;
import com.foliole.android.framed.FramedSyncTransferSequence;
import com.foliole.android.framed.FramedSyncValidatedMessage;
import com.getcapacitor.PluginCall;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncPullBatchInput {
    private FolioleCompanionFramedSyncPullBatchInput() {}

    static List<FolioleCompanionFramedSyncPullInput.Request> requests(PluginCall call) throws Exception {
        return requests(call.getData());
    }

    static List<FolioleCompanionFramedSyncPullInput.Request> requests(JSONObject args) throws Exception {
        if (args.toString().getBytes(StandardCharsets.UTF_8).length > FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES) {
            throw new IllegalArgumentException("framed_sync_control_message_limit_exceeded");
        }
        JSONArray requests = args.getJSONArray("requests");
        if (requests.length() < 1 || requests.length() > FramedSyncTransferSequence.MAX_ITEMS) {
            throw new IllegalArgumentException("framed_sync_batch_item_limit_exceeded");
        }
        List<FolioleCompanionFramedSyncPullInput.Request> result = new ArrayList<>();
        var identities = new HashSet<String>();
        int bytes = 0;
        for (int index = 0; index < requests.length(); index++) {
            JSONObject raw = new JSONObject(requests.getJSONObject(index).toString());
            if (raw.has("resources") || raw.has("stage_only") || raw.has("round_id")) {
                throw new IllegalArgumentException("framed_sync_database_request_required");
            }
            raw.put("round_id", args.getString("round_id"));
            var request = FolioleCompanionFramedSyncPullInput.request(raw);
            if (!identities.add(request.objectType + "\u0000" + request.objectId)) {
                throw new IllegalArgumentException("framed_sync_difference_request_identity_duplicate");
            }
            if (request.frontierFactIds.isEmpty() && request.requiredRelationIds.isEmpty() &&
                request.reviewFactIds.isEmpty() && request.stateFactIds.isEmpty()) {
                throw new IllegalArgumentException("framed_sync_difference_request_fact_required");
            }
            for (var message : FolioleCompanionFramedSyncPullInput.messages(request)) {
                bytes += com.foliole.android.framed.FramedSyncCodec.encode(message).length;
                if (bytes > FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES) {
                    throw new IllegalArgumentException("framed_sync_control_message_limit_exceeded");
                }
            }
            result.add(request);
        }
        return result;
    }

    static List<FramedSyncValidatedMessage> messages(List<FolioleCompanionFramedSyncPullInput.Request> requests) throws Exception {
        List<FramedSyncValidatedMessage> result = new ArrayList<>();
        for (var request : requests) result.addAll(FolioleCompanionFramedSyncPullInput.messages(request));
        return result;
    }
}
