package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactRecord;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

final class FramedSyncSQLiteFacts {
    private final SQLiteDatabase database;
    private final FramedSyncSQLiteTransfers transfers;

    FramedSyncSQLiteFacts(SQLiteDatabase database, FramedSyncSQLiteTransfers transfers) {
        this.database = database;
        this.transfers = transfers;
    }

    void stage(FramedSyncAuthenticatedFrame frame, FactRecord fact) throws Exception {
        FactDescriptor descriptor = findDescriptor(frame, fact);
        if (descriptor == null || !descriptor.getSharedStateHash().equals(fact.getSharedStateHash())) {
            throw invalid("inbound_fact_undeclared");
        }
        var identity = fact.getIdentity();
        ContentValues values = new ContentValues();
        values.put("transfer_id", frame.transferId());
        values.put("attempt_id", frame.attemptId());
        values.put("fact_kind", identity.getKindValue());
        values.put("object_type", identity.getObjectType());
        values.put("global_id", identity.getGlobalId());
        values.put("fact_id", identity.getFactId());
        values.put("canonical_bytes", fact.toByteArray());
        long inserted = database.insertWithOnConflict(
            "framed_sync_android_facts", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted < 0 && !matches(frame, fact)) throw invalid("inbound_fact_identity_conflict");
    }

    List<FactRecord> load(byte[] transferId, byte[] attemptId) throws Exception {
        List<FactRecord> facts = new ArrayList<>();
        try (Cursor rows = database.query("framed_sync_android_facts", new String[] {"canonical_bytes"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            while (rows.moveToNext()) facts.add(FactRecord.parseFrom(rows.getBlob(0)));
        }
        return facts;
    }

    private FactDescriptor findDescriptor(FramedSyncAuthenticatedFrame frame, FactRecord fact)
        throws Exception {
        var header = transfers.loadHeader(frame.transferId(), frame.attemptId());
        if (header == null) return null;
        for (FactDescriptor descriptor : header.getManifest().getFactsList()) {
            if (descriptor.getIdentity().equals(fact.getIdentity())) return descriptor;
        }
        return null;
    }

    private boolean matches(FramedSyncAuthenticatedFrame frame, FactRecord fact) {
        var identity = fact.getIdentity();
        try (Cursor row = database.query("framed_sync_android_facts", new String[] {"canonical_bytes"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND fact_kind = ? AND object_type = ? " +
                "AND global_id = ? AND fact_id = ?",
            FramedSyncSQLiteValues.blobArgs(frame.transferId(), frame.attemptId(), identity.getKindValue(),
                identity.getObjectType(), identity.getGlobalId(), identity.getFactId()), null, null, null)) {
            return row.moveToFirst() && Arrays.equals(row.getBlob(0), fact.toByteArray());
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
