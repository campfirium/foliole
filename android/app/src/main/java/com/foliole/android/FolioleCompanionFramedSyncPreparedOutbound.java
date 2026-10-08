package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import org.json.JSONObject;

/** Decode the leased header once and discard its bridge number array before returning. */
final class FolioleCompanionFramedSyncPreparedOutbound {
    final JSONObject metadata;
    final FolioleCompanionFramedSyncOutboundSource source;

    private FolioleCompanionFramedSyncPreparedOutbound(JSONObject metadata,
        FolioleCompanionFramedSyncOutboundSource source) {
        this.metadata = metadata;
        this.source = source;
    }

    static FolioleCompanionFramedSyncPreparedOutbound load(Context context,
        FolioleCompanionSyncGroupDataBridge bridge, JSONObject selection, FramedSyncPayloadBudget budget)
        throws Exception {
        Object resources;
        try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            JSONObject inspected = bridge.request("inspect_framed_outbound", new JSONObject(selection.toString())
                .put("payload_loan", FolioleCompanionFramedSyncPayloadBudgetActions.description(loan)), budget);
            resources = FolioleCompanionFramedSyncResources.describe(context, inspected);
        }
        try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            JSONObject prepared = bridge.request("prepare_framed_outbound",
                new JSONObject(selection.toString()).put("resource_files", resources)
                    .put("payload_loan", FolioleCompanionFramedSyncPayloadBudgetActions.description(loan)), budget);
            var source = new FolioleCompanionFramedSyncOutboundSource(bridge, selection, prepared, budget);
            prepared.remove("header_message_bytes");
            return new FolioleCompanionFramedSyncPreparedOutbound(prepared, source);
        }
    }

    static byte[] receiptContentId(FolioleCompanionSyncGroupDataBridge bridge, JSONObject selection,
        String transferId, FramedSyncPayloadBudget budget) throws Exception {
        JSONObject inspected = bridge.request("inspect_framed_outbound", new JSONObject(selection.toString())
            .put("transfer_id", transferId).put("receipt_only", true), budget);
        return FolioleCompanionFramedSyncOutbound.digest(inspected.getString("content_id"));
    }
}
