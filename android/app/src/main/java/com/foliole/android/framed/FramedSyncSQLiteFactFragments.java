package com.foliole.android.framed;

import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.FactFragment;
import com.foliole.sync.v22.ProtocolMessage;

final class FramedSyncSQLiteFactFragments {
    private final SQLiteDatabase database;

    FramedSyncSQLiteFactFragments(SQLiteDatabase database) { this.database = database; }

    void requireContinuation(FramedSyncAuthenticatedFrame frame, FramedSyncValidatedMessage message)
        throws Exception {
        long sequence = FramedSyncWireHeader.decode(frame.frameHeader()).sequence();
        if (sequence == 0) return;
        byte[] previous = read(frame.transferId(), frame.attemptId(), sequence - 1);
        FramedSyncFactFragments.continuation(previous == null ? null : ProtocolMessage.parseFrom(previous),
            message.wireMessage());
    }

    void stage(FramedSyncAuthenticatedFrame frame, FactFragment fragment, FramedSyncSQLiteFacts facts)
        throws Exception {
        if (!FramedSyncFactFragments.complete(fragment)) return;
        long last = FramedSyncWireHeader.decode(frame.frameHeader()).sequence();
        long first = last;
        FactFragment previous = fragment;
        while (previous.getOffset() != 0) {
            if (first == 0) throw invalid("fact_fragment_sequence_invalid");
            first -= 1;
            previous = FramedSyncFactFragments.fragment(read(frame.transferId(), frame.attemptId(), first));
        }
        var fact = FramedSyncFactFragments.assemble(first, last,
            sequence -> read(frame.transferId(), frame.attemptId(), sequence));
        facts.stageFragment(frame, fact, first, last);
    }

    com.foliole.sync.v22.FactRecord fact(byte[] transferId, byte[] attemptId, long first, long last)
        throws Exception {
        return FramedSyncFactFragments.assemble(first, last, sequence -> read(transferId, attemptId, sequence));
    }

    private byte[] read(byte[] transferId, byte[] attemptId, long sequence) throws Exception {
        String bytes = "CASE WHEN length(authenticated_plaintext) <= " +
            FramedSyncContract.MAX_FRAME_MESSAGE_BYTES + " THEN authenticated_plaintext ELSE NULL END";
        try (var row = database.query("framed_sync_android_frames", new String[] {bytes},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND sequence = ? AND frame_type = 3",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId, Long.toUnsignedString(sequence)),
            null, null, null)) {
            if (!row.moveToFirst() || row.isNull(0)) return null;
            return row.getBlob(0);
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
