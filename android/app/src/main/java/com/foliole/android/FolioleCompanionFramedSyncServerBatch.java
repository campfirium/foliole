package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.FramedSyncCodec;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncSessionRequest;
import com.foliole.android.framed.FramedSyncTransferContext;
import com.foliole.android.framed.FramedSyncTransferPrefix;
import com.foliole.sync.v22.DifferenceRequest;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import org.json.JSONObject;

/** Validate every requested snapshot before sealing only the bounded response prefix. */
final class FolioleCompanionFramedSyncServerBatch {
    private FolioleCompanionFramedSyncServerBatch() {}
    static void respond(Context host, FolioleCompanionSyncGroupDataBridge bridge, FramedSyncSessionRequest request,
        JSONObject context, byte[] key, File directory, OutputStream output, FramedSyncPayloadBudget budget) throws Exception {
        for (int index = 0; index < request.differenceCount(); index++) {
            try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
                bridge.request("inspect_framed_outbound", selection(request, index, context)
                    .put("payload_loan", FolioleCompanionFramedSyncPayloadBudgetActions.description(loan)), budget);
            }
        }
        var transferContext = new FramedSyncTransferContext(context.getString("group_id"),
            context.getString("sender_device_id"), context.getString("sender_library_epoch"),
            context.getString("receiver_device_id"), context.getString("receiver_library_epoch"));
        var prefix = new FramedSyncTransferPrefix<FolioleCompanionFramedSyncSealedOutbound>();
        try {
            for (int index = 0; index < request.differenceCount() && prefix.hasRoom(); index++) {
                var item = FolioleCompanionFramedSyncSealedOutbound.prepare(host, bridge,
                    selection(request, index, context), index, key, transferContext, budget);
                if (!prefix.offer(item)) { item.close(); break; }
            }
            write(prefix, directory, output, context, budget);
        } finally { for (var item : prefix.items()) item.close(); }
    }
    private static JSONObject selection(FramedSyncSessionRequest request, int index, JSONObject context) throws Exception {
        byte[] bytes = request.differenceBytes(index);
        var difference = (DifferenceRequest) FramedSyncCodec.decode(bytes, 1).payload().value();
        var identity = difference.getFacts(0);
        return new JSONObject(context.toString()).put("difference_request_hex", FolioleCompanionFramedSyncOutbound.hex(bytes))
            .put("object_id", identity.getGlobalId()).put("object_type", identity.getObjectType());
    }
    private static void write(FramedSyncTransferPrefix<FolioleCompanionFramedSyncSealedOutbound> prefix,
        File directory, OutputStream output, JSONObject context, FramedSyncPayloadBudget budget) throws Exception {
        if (prefix.items().isEmpty()) throw new IllegalArgumentException("framed_sync_outbound_fact_set_empty");
        File response = File.createTempFile("foliole-framed-response-prefix-", ".body", directory);
        try {
            try (var file = new FileOutputStream(response)) {
                for (var item : prefix.items()) item.copyTo(file, budget);
                file.getFD().sync();
            }
            FolioleCompanionHttpResponse.framedSequence(output, response,
                context.getString("sender_device_id"), context.getString("sender_library_epoch"), budget, FramedSyncPayloadBudget.Lane.PAYLOAD);
        } finally { if (response.exists() && !response.delete()) throw new java.io.IOException("http_body_cleanup_failed"); }
    }
}
