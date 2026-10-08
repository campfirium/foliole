package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.BlobReference;
import com.google.protobuf.InvalidProtocolBufferException;
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
        stage(frame, fact, null, null);
    }

    void stageFragment(FramedSyncAuthenticatedFrame frame, FactRecord fact, long first, long last)
        throws Exception {
        stage(frame, fact, first, last);
    }

    private void stage(FramedSyncAuthenticatedFrame frame, FactRecord fact, Long first, Long last)
        throws Exception {
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
        values.put("canonical_bytes", first == null ? fact.toByteArray() : new byte[0]);
        if (first != null) {
            values.put("first_sequence", Long.toUnsignedString(first));
            values.put("last_sequence", Long.toUnsignedString(last));
        }
        long inserted = database.insertWithOnConflict(
            "framed_sync_android_facts", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted < 0 && !matches(frame, fact, first, last)) throw invalid("inbound_fact_identity_conflict");
    }

    int count(byte[] transferId, byte[] attemptId) {
        try (Cursor row = database.query("framed_sync_android_facts", new String[] {"count(*)"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            return row.moveToFirst() ? row.getInt(0) : 0;
        }
    }

    byte[] contentId(byte[] transferId, byte[] attemptId, List<BlobReference> blobs)
        throws FramedSyncValidationException {
        String boundedBytes = "CASE WHEN typeof(canonical_bytes) = 'blob' AND length(canonical_bytes) <= " +
            FramedSyncContract.MAX_FRAME_MESSAGE_BYTES + " THEN canonical_bytes ELSE NULL END";
        try (Cursor rows = database.query("framed_sync_android_facts",
            new String[] {boundedBytes, "first_sequence", "last_sequence"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null,
            "fact_kind, object_type COLLATE BINARY, global_id COLLATE BINARY, fact_id COLLATE BINARY")) {
            return FramedSyncCanonicalManifest.contentId(rows.getCount(), blobs, (index) -> {
                if (!rows.moveToNext()) throw invalid("canonical_fact_source_changed");
                if (!rows.isNull(1)) {
                    if (rows.isNull(2)) throw invalid("canonical_fact_source_changed");
                    try { return new FramedSyncSQLiteFactFragments(database).fact(transferId, attemptId,
                        Long.parseUnsignedLong(rows.getString(1)), Long.parseUnsignedLong(rows.getString(2))); }
                    catch (FramedSyncValidationException error) { throw error; }
                    catch (Exception error) { throw invalid("canonical_fact_source_changed"); }
                }
                if (rows.isNull(0) || !rows.isNull(2)) throw invalid("canonical_fact_source_changed");
                try { return FactRecord.parseFrom(rows.getBlob(0)); }
                catch (InvalidProtocolBufferException error) { throw invalid("canonical_fact_source_changed"); }
            });
        }
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

    private boolean matches(FramedSyncAuthenticatedFrame frame, FactRecord fact, Long first, Long last) {
        var identity = fact.getIdentity();
        try (Cursor row = database.query("framed_sync_android_facts",
            new String[] {"canonical_bytes", "first_sequence", "last_sequence"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND fact_kind = ? AND object_type = ? " +
                "AND global_id = ? AND fact_id = ?",
            FramedSyncSQLiteValues.blobArgs(frame.transferId(), frame.attemptId(), identity.getKindValue(),
                identity.getObjectType(), identity.getGlobalId(), identity.getFactId()), null, null, null)) {
            if (!row.moveToFirst()) return false;
            if (first != null) return !row.isNull(1) && !row.isNull(2) &&
                row.getString(1).equals(Long.toUnsignedString(first)) &&
                row.getString(2).equals(Long.toUnsignedString(last));
            return row.isNull(1) && row.isNull(2) && Arrays.equals(row.getBlob(0), fact.toByteArray());
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
