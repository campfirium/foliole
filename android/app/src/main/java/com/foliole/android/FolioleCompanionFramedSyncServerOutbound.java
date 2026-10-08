package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.FramedSyncOutboundSQLite;
import com.foliole.android.framed.FramedSyncReceiptReader;
import com.foliole.android.framed.FramedSyncTransferContext;
import com.foliole.android.framed.FramedSyncTransferWriter;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncServerOutbound {
    private FolioleCompanionFramedSyncServerOutbound() {}

    static void respond(Context host, FolioleCompanionSyncGroupDataBridge bridge,
        JSONObject selection, byte[] groupKey, File directory, OutputStream output, FramedSyncPayloadBudget budget) throws Exception {
        var preparedOwner = FolioleCompanionFramedSyncPreparedOutbound.load(host, bridge, selection, budget);
        JSONObject prepared = preparedOwner.metadata;
        String transferId = prepared.getString("transfer_id");
        byte[] expected = FolioleCompanionFramedSyncOutbound.digest(transferId);
        FolioleCompanionFramedSyncOutbound.requireSame(
            FolioleCompanionFramedSyncOutbound.digest(prepared.getString("content_id")),
            FolioleCompanionFramedSyncOutbound.digest(prepared.getString("manifest_hash")),
            "framed_sync_manifest_identity_mismatch");
        try (var bodies = new FolioleCompanionFramedSyncBodyFiles(host, selection, transferId, budget);
             var staging = new FramedSyncOutboundSQLite(host, budget)) {
            var attempt = staging.loadLatestReplayableAttempt(expected);
            if (attempt == null) {
                var source = preparedOwner.source;
                var blobs = FolioleCompanionFramedSyncOutboundInput.declaredBlobs(host, prepared,
                    source.header().getManifest().getBlobsList(), bodies::resolve);
                var context = new FramedSyncTransferContext(selection.getString("group_id"),
                    selection.getString("sender_device_id"), selection.getString("sender_library_epoch"),
                    selection.getString("receiver_device_id"), selection.getString("receiver_library_epoch"));
                attempt = FramedSyncTransferWriter.prepare(groupKey, context, source, blobs, staging, directory);
            }
            FolioleCompanionFramedSyncOutbound.requireSame(expected, attempt.transferId(),
                "framed_sync_transfer_identity_mismatch");
            File response = File.createTempFile("foliole-framed-response-", ".body", directory);
            try {
                try (var file = new FileOutputStream(response)) {
                    FramedSyncTransferWriter.replay(attempt, staging, file);
                }
                FolioleCompanionHttpResponse.framed(output, response,
                    selection.getString("sender_device_id"), selection.getString("sender_library_epoch"), budget, FramedSyncPayloadBudget.Lane.PAYLOAD);
            } finally {
                if (response.exists() && !response.delete()) throw new java.io.IOException("http_body_cleanup_failed");
            }
        }
    }

    static void receipt(Context host, FolioleCompanionSyncGroupDataBridge bridge, InputStream input,
        byte[] groupKey, byte[] transferId, JSONObject selection, FramedSyncPayloadBudget budget) throws Exception {
        byte[] contentId = FolioleCompanionFramedSyncPreparedOutbound.receiptContentId(bridge,
            selection, FolioleCompanionFramedSyncOutbound.hex(transferId), budget);
        var receipt = FramedSyncReceiptReader.read(input, groupKey, transferId, contentId,
            selection.getString("receiver_device_id"), selection.getString("receiver_library_epoch"), budget);
        bridge.request("complete_framed_outbound", FolioleCompanionFramedSyncOutbound.result(receipt), budget);
        try (var staging = new FramedSyncOutboundSQLite(host)) { staging.discardOutboundAttempts(transferId); }
    }
}
