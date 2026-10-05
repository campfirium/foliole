package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.util.Arrays;

final class FramedSyncOutboundFrameFiles {
    private static final String TABLE = "framed_sync_android_outbound_file_frames";
    private final SQLiteDatabase database;
    private final File directory;

    FramedSyncOutboundFrameFiles(SQLiteDatabase database, File directory) {
        this.database = database;
        this.directory = directory;
        directory.mkdirs();
        database.execSQL("CREATE TABLE IF NOT EXISTS " + TABLE + " (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL, " +
            "frame_header BLOB NOT NULL, wire_offset INTEGER NOT NULL, ciphertext_length INTEGER NOT NULL, " +
            "ciphertext_sha256 BLOB NOT NULL, plaintext_sha256 BLOB NOT NULL, " +
            "PRIMARY KEY (transfer_id, attempt_id, sequence), FOREIGN KEY (transfer_id, attempt_id) " +
            "REFERENCES framed_sync_android_outbound_attempts(transfer_id, attempt_id) ON DELETE CASCADE)");
    }

    FramedSyncStageOutcome commit(FramedSyncAuthenticatedFrame frame, FramedSyncWireHeader header)
        throws Exception {
        byte[] ciphertextHash = sha256(frame.ciphertext());
        byte[] plaintextHash = sha256(frame.plaintext());
        String[] where = FramedSyncSQLiteValues.blobArgs(frame.transferId(), frame.attemptId(),
            Long.toUnsignedString(header.sequence()));
        try (Cursor row = database.query(TABLE, new String[] {"frame_header", "wire_offset",
            "ciphertext_length", "ciphertext_sha256", "plaintext_sha256"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND sequence = ?", where,
            null, null, null)) {
            if (row.moveToFirst()) {
                boolean same = Arrays.equals(row.getBlob(0), frame.frameHeader()) &&
                    row.getLong(2) == frame.ciphertext().length &&
                    Arrays.equals(row.getBlob(3), ciphertextHash) &&
                    Arrays.equals(row.getBlob(4), plaintextHash) &&
                    Arrays.equals(read(wireFile(frame.transferId(), frame.attemptId()),
                        row.getLong(1), row.getLong(2)), frame.ciphertext());
                if (!same) throw invalid("outbound_frame_identity_conflict");
                return FramedSyncStageOutcome.IDENTICAL;
            }
        }
        long offset = nextOffset(frame.transferId(), frame.attemptId());
        write(wireFile(frame.transferId(), frame.attemptId()), offset, frame.ciphertext());
        ContentValues values = new ContentValues();
        values.put("transfer_id", frame.transferId());
        values.put("attempt_id", frame.attemptId());
        values.put("sequence", Long.toUnsignedString(header.sequence()));
        values.put("frame_header", frame.frameHeader());
        values.put("wire_offset", offset);
        values.put("ciphertext_length", frame.ciphertext().length);
        values.put("ciphertext_sha256", ciphertextHash);
        values.put("plaintext_sha256", plaintextHash);
        database.insertOrThrow(TABLE, null, values);
        return FramedSyncStageOutcome.CREATED;
    }

    void replay(byte[] transferId, byte[] attemptId, FramedSyncStreamWriter writer) throws Exception {
        File file = wireFile(transferId, attemptId);
        try (Cursor rows = database.rawQuery("SELECT f.frame_header, f.wire_offset, " +
            "f.ciphertext_length, f.ciphertext_sha256 FROM framed_sync_android_outbound_attempts a " +
            "JOIN " + TABLE + " f ON f.transfer_id = a.transfer_id AND f.attempt_id = a.attempt_id " +
            "WHERE hex(a.transfer_id) = ? AND hex(a.attempt_id) = ? AND a.state = 'replayable' " +
            "ORDER BY length(f.sequence), f.sequence",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId))) {
            while (rows.moveToNext()) {
                byte[] ciphertext = read(file, rows.getLong(1), rows.getLong(2));
                if (!MessageDigest.isEqual(sha256(ciphertext), rows.getBlob(3))) {
                    throw invalid("outbound_frame_file_invalid");
                }
                writer.writeFrame(rows.getBlob(0), ciphertext);
            }
        }
    }

    void requireComplete(byte[] transferId, byte[] attemptId) throws Exception {
        long expected = 0;
        int lastType = -1;
        try (Cursor rows = database.query(TABLE, new String[] {"sequence", "frame_header"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null,
            "length(sequence), sequence")) {
            while (rows.moveToNext()) {
                long sequence = Long.parseUnsignedLong(rows.getString(0));
                if (sequence != expected++) throw invalid("outbound_frame_sequence_not_contiguous");
                lastType = FramedSyncWireHeader.decode(rows.getBlob(1)).frameType();
            }
        }
        if (expected == 0 || lastType != FramedSyncFrameType.TRANSFER_TRAILER.wireValue()) {
            throw invalid("outbound_transfer_trailer_required");
        }
    }

    String table() { return TABLE; }

    private long nextOffset(byte[] transferId, byte[] attemptId) {
        try (Cursor row = database.rawQuery("SELECT COALESCE(MAX(wire_offset + ciphertext_length), 0) " +
            "FROM " + TABLE + " WHERE hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId))) {
            row.moveToFirst();
            return row.getLong(0);
        }
    }

    private File wireFile(byte[] transferId, byte[] attemptId) {
        return new File(directory, FramedSyncResourceFiles.hex(transferId) + "-" +
            FramedSyncResourceFiles.hex(attemptId) + ".wire");
    }

    private static void write(File file, long offset, byte[] value) throws Exception {
        try (RandomAccessFile output = new RandomAccessFile(file, "rw")) {
            output.seek(offset);
            output.write(value);
            output.setLength(offset + value.length);
        }
    }

    private static byte[] read(File file, long offset, long length) throws Exception {
        if (length < 0 || length > Integer.MAX_VALUE) throw invalid("outbound_frame_file_invalid");
        byte[] result = new byte[(int) length];
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            input.seek(offset);
            input.readFully(result);
        }
        return result;
    }

    private static byte[] sha256(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
