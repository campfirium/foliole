package com.foliole.android;

import com.foliole.android.framed.FramedSyncCodec;
import com.foliole.android.framed.FramedSyncContract;
import com.foliole.android.framed.FramedSyncOutboundFactSource;
import com.foliole.android.framed.FramedSyncPayload;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.sync.v22.TransferHeader;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncOutboundSource implements FramedSyncOutboundFactSource {
    private final FolioleCompanionSyncGroupDataBridge bridge;
    private final JSONObject selection;
    private final TransferHeader header;
    private final FramedSyncPayloadBudget budget;

    FolioleCompanionFramedSyncOutboundSource(FolioleCompanionSyncGroupDataBridge bridge,
        JSONObject selection, JSONObject prepared, FramedSyncPayloadBudget budget) throws Exception {
        this.bridge = bridge;
        this.budget = budget;
        if (selection.has("transfer_id")) FolioleCompanionFramedSyncOutbound.requireSame(
            FolioleCompanionFramedSyncOutbound.digest(selection.getString("transfer_id")),
            FolioleCompanionFramedSyncOutbound.digest(prepared.getString("transfer_id")),
            "framed_sync_transfer_identity_mismatch");
        this.selection = new JSONObject(selection.toString())
            .put("transfer_id", prepared.getString("transfer_id"));
        var decoded = FramedSyncCodec.decode(bytes(prepared.getJSONArray("header_message_bytes")), 2);
        if (decoded.payload().payloadCase() != FramedSyncPayload.Case.TRANSFER_HEADER) {
            throw new IllegalArgumentException("framed_sync_header_required");
        }
        header = (TransferHeader) decoded.payload().value();
        FolioleCompanionFramedSyncOutbound.requireSame(
            FolioleCompanionFramedSyncOutbound.digest(prepared.getString("transfer_id")),
            header.getTransferId().toByteArray(), "framed_sync_transfer_identity_mismatch");
        byte[] content = FolioleCompanionFramedSyncOutbound.digest(prepared.getString("content_id"));
        FolioleCompanionFramedSyncOutbound.requireSame(content,
            FolioleCompanionFramedSyncOutbound.digest(prepared.getString("manifest_hash")),
            "framed_sync_manifest_identity_mismatch");
        FolioleCompanionFramedSyncOutbound.requireSame(content,
            header.getManifest().getContentId().toByteArray(), "framed_sync_manifest_identity_mismatch");
        for (byte value : header.getAttemptId().toByteArray()) {
            if (value != 0) throw new IllegalArgumentException("framed_sync_header_attempt_invalid");
        }
    }

    @Override public TransferHeader header() { return header; }
    @Override public FramedSyncPayloadBudget budget() { return budget; }

    @Override public void read(int factIndex, int fragmentIndex, Consumer consumer) throws Exception {
        try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            JSONObject response = bridge.request("read_framed_outbound_fact",
                new JSONObject(selection.toString()).put("fact_index", factIndex)
                    .put("fragment_index", fragmentIndex)
                    .put("payload_loan", FolioleCompanionFramedSyncPayloadBudgetActions.description(loan)), budget);
            Object last = response.get("last_fragment");
            if (!(last instanceof Boolean)) throw new IllegalArgumentException("framed_sync_fact_bytes_invalid");
            consumer.accept(bytes(response.getJSONArray("message_bytes")), (Boolean) last);
        }
    }

    private static byte[] bytes(JSONArray values) throws Exception {
        if (values.length() == 0 || values.length() > FramedSyncContract.MAX_FRAME_MESSAGE_BYTES) {
            throw new IllegalArgumentException("frame_payload_limit_exceeded");
        }
        byte[] result = new byte[values.length()];
        for (int index = 0; index < result.length; index++) {
            Object value = values.get(index);
            if (!(value instanceof Number) || ((Number) value).doubleValue() !=
                ((Number) value).intValue() || ((Number) value).intValue() < 0 ||
                ((Number) value).intValue() > 255) {
                throw new IllegalArgumentException("framed_sync_fact_bytes_invalid");
            }
            result[index] = (byte) ((Number) value).intValue();
        }
        return result;
    }
}
