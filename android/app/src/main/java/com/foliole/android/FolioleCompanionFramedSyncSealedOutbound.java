package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.*;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import org.json.JSONObject;

/** A sealed ciphertext file keeps only identity and size metadata after the original source scope ends. */
final class FolioleCompanionFramedSyncSealedOutbound implements AutoCloseable, FramedSyncBatchPacking.Item {
    final File file;
    final byte[] transferId;
    final byte[] contentId;
    final String objectId;
    final String objectType;
    final int index;
    private final long messageBytes;
    private final boolean batchReady;

    private FolioleCompanionFramedSyncSealedOutbound(File file, JSONObject selection, JSONObject metadata,
        int index, long messageBytes) throws Exception {
        this.file = file;
        transferId = FolioleCompanionFramedSyncOutbound.digest(metadata.getString("transfer_id"));
        contentId = FolioleCompanionFramedSyncOutbound.digest(metadata.getString("content_id"));
        objectId = selection.getString("object_id");
        objectType = selection.getString("object_type");
        this.index = index;
        this.messageBytes = messageBytes;
        batchReady = Boolean.TRUE.equals(metadata.opt("batch_ready"));
    }

    static FolioleCompanionFramedSyncSealedOutbound prepare(Context host, JSONObject selection, int index,
        byte[] key, FramedSyncTransferContext context, FramedSyncPayloadBudget budget) throws Exception {
        return prepare(host, FolioleCompanionSyncGroupDataBridge.current(), selection, index, key, context, budget);
    }
    static FolioleCompanionFramedSyncSealedOutbound prepare(Context host, FolioleCompanionSyncGroupDataBridge bridge,
        JSONObject selection, int index, byte[] key, FramedSyncTransferContext context, FramedSyncPayloadBudget budget) throws Exception {
        var prepared = FolioleCompanionFramedSyncPreparedOutbound.load(host, bridge, selection, budget);
        File file = File.createTempFile("foliole-framed-sealed-", ".body", host.getCacheDir());
        byte[] transfer = FolioleCompanionFramedSyncOutbound.digest(prepared.metadata.getString("transfer_id"));
        try (var staging = new FramedSyncOutboundSQLite(host, budget)) {
            try {
                var attempt = FolioleCompanionFramedSyncAttempt.prepare(host, selection, prepared.metadata,
                    prepared.source, key, context, staging, budget);
                try (var output = new FileOutputStream(file)) {
                    FramedSyncTransferWriter.replay(attempt, staging, output);
                    output.getFD().sync();
                }
                try (var sequence = new FramedSyncTransferSequence(file); var unit = sequence.next()) {
                    return new FolioleCompanionFramedSyncSealedOutbound(file, selection, prepared.metadata, index, unit.messageBytes());
                }
            } finally { staging.discardOutboundAttempts(transfer); }
        } catch (Exception error) { file.delete(); throw error; }
    }

    @Override public long messageBytes() { return messageBytes; }
    @Override public boolean batchReady() { return batchReady; }
    void copyTo(OutputStream output, FramedSyncPayloadBudget budget) throws Exception {
        try (var input = new FileInputStream(file)) {
            while (true) try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
                byte[] buffer = new byte[64 * 1024];
                int count = input.read(buffer);
                if (count < 0) break;
                output.write(buffer, 0, count);
            }
        }
    }
    @Override public void close() throws Exception {
        if (file.exists() && !file.delete()) throw new java.io.IOException("http_body_cleanup_failed");
    }
}
