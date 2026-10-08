package com.foliole.android.framed;

import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferReceipt;
import java.io.File;
import java.util.Arrays;
import java.util.List;

public final class FramedSyncSQLiteStaging implements FramedSyncDurableStaging {
    private final FramedSyncSQLiteInboundFrames inbound;
    private final FramedSyncSQLiteReceipts receipts;
    private final FramedSyncSQLiteReceiptReplay receiptReplay;

    public FramedSyncSQLiteStaging(SQLiteDatabase database) {
        this(database, null);
    }

    public FramedSyncSQLiteStaging(SQLiteDatabase database, File resourceDirectory) {
        if (database == null) throw new NullPointerException("database");
        if (!database.isOpen() || database.isReadOnly()) {
            throw new IllegalArgumentException("framed_sync_database_not_writable");
        }
        FramedSyncSQLiteSchema.install(database);
        inbound = new FramedSyncSQLiteInboundFrames(database, resourceDirectory);
        receipts = new FramedSyncSQLiteReceipts(database);
        receiptReplay = new FramedSyncSQLiteReceiptReplay(database, receipts);
    }

    @Override
    public synchronized FramedSyncStageOutcome admitInboundTransfer(TransferProposal proposal) throws Exception {
        return inbound.admit(proposal);
    }

    @Override
    public synchronized FramedSyncStageOutcome commitInboundFrame(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncValidatedMessage message
    ) throws Exception {
        if (!Arrays.equals(FramedSyncCodec.encode(message), frame.borrowedPlaintext())) {
            throw new FramedSyncValidationException("framed_sync_stage_plaintext_mismatch");
        }
        if (message.payload().payloadCase() == FramedSyncPayload.Case.TRANSFER_RECEIPT) {
            return receiptReplay.commitFrame(frame, (TransferReceipt) message.payload().value());
        }
        return inbound.commit(frame, message);
    }

    @Override
    public synchronized void invalidateInboundAttempt(byte[] transferId, byte[] attemptId) throws Exception {
        inbound.invalidate(transferId, attemptId);
    }

    @Override
    public synchronized FramedSyncStageOutcome commitReceipt(TransferReceipt receipt) throws Exception {
        return receipts.commit(receipt);
    }

    @Override
    public synchronized FramedSyncStageOutcome prepareReceiptAttempt(
        byte[] transferId,
        byte[] attemptId,
        byte[] preamble
    ) throws Exception {
        return receiptReplay.prepare(transferId, attemptId, preamble);
    }

    @Override
    public synchronized FramedSyncStageOutcome finalizeReceiptAttempt(byte[] transferId, byte[] attemptId)
        throws Exception {
        return receiptReplay.finalizeAttempt(transferId, attemptId);
    }

    @Override
    public synchronized List<FramedSyncAuthenticatedFrame> loadReplayableReceiptFrames(
        byte[] transferId,
        byte[] attemptId
    ) throws Exception {
        return receiptReplay.load(transferId, attemptId);
    }

    synchronized FramedSyncResourcePublication publishResources(byte[] transferId) throws Exception {
        return inbound.publishResources(transferId);
    }
}
