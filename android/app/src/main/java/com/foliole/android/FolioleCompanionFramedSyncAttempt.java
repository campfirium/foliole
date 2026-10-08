package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.*;
import org.json.JSONObject;

/** Freeze one original selected transfer through its existing authenticated staging owner. */
final class FolioleCompanionFramedSyncAttempt {
    private FolioleCompanionFramedSyncAttempt() {}
    static FramedSyncTransferWriter.Attempt prepare(Context host, JSONObject selection, JSONObject metadata,
        FolioleCompanionFramedSyncOutboundSource source, byte[] key, FramedSyncTransferContext context,
        FramedSyncOutboundSQLite staging, FramedSyncPayloadBudget budget) throws Exception {
        byte[] expected = FolioleCompanionFramedSyncOutbound.digest(metadata.getString("transfer_id"));
        try (var bodies = new FolioleCompanionFramedSyncBodyFiles(host, selection, metadata.getString("transfer_id"), budget)) {
            var blobs = FolioleCompanionFramedSyncOutboundInput.declaredBlobs(host, metadata,
                source.header().getManifest().getBlobsList(), bodies::resolve);
            staging.discardOutboundAttempts(expected);
            var attempt = staging.loadLatestReplayableAttempt(expected);
            if (attempt == null) attempt = FramedSyncTransferWriter.prepare(key, context, source, blobs, staging, host.getCacheDir());
            FolioleCompanionFramedSyncOutbound.requireSame(expected, attempt.transferId(), "framed_sync_transfer_identity_mismatch");
            return attempt;
        }
    }
}
