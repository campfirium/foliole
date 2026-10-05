package com.foliole.android.framed;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.security.MessageDigest;

public final class FramedSyncSessionNonceSQLite
    implements FramedSyncSessionNonceStore, AutoCloseable {
    private static final String DATABASE_NAME = "foliole-framed-sync-session.db";
    private final SQLiteDatabase database;

    public FramedSyncSessionNonceSQLite(Context context) {
        this(context.getApplicationContext().openOrCreateDatabase(
            DATABASE_NAME, Context.MODE_PRIVATE, null));
    }

    FramedSyncSessionNonceSQLite(SQLiteDatabase database) {
        this.database = database;
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_session_send_states (" +
            "session_id BLOB PRIMARY KEY, context_id BLOB NOT NULL, nonce_prefix BLOB NOT NULL, " +
            "starting_sequence INTEGER NOT NULL)");
    }

    @Override public void persistBeforeEncryption(
        byte[] sessionId, byte[] contextId, byte[] noncePrefix, long startingSequence
    ) throws Exception {
        validate(sessionId, contextId, noncePrefix, startingSequence);
        database.beginTransaction();
        try {
            ContentValues values = new ContentValues();
            values.put("session_id", sessionId);
            values.put("context_id", contextId);
            values.put("nonce_prefix", noncePrefix);
            values.put("starting_sequence", startingSequence);
            long inserted = database.insertWithOnConflict(
                "framed_sync_session_send_states", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            if (inserted < 0 && !matches(sessionId, contextId, noncePrefix, startingSequence)) {
                throw new FramedSyncValidationException("session_nonce_reuse_detected");
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private boolean matches(
        byte[] sessionId, byte[] contextId, byte[] noncePrefix, long startingSequence
    ) {
        try (Cursor row = database.query("framed_sync_session_send_states",
            new String[] { "context_id", "nonce_prefix", "starting_sequence" },
            "lower(hex(session_id)) = ?", new String[] { blobHex(sessionId) }, null, null, null)) {
            if (!row.moveToFirst()) return false;
            return MessageDigest.isEqual(contextId, row.getBlob(0)) &&
                MessageDigest.isEqual(noncePrefix, row.getBlob(1)) &&
                startingSequence == row.getLong(2);
        }
    }

    private static String blobHex(byte[] value) {
        char[] digits = "0123456789abcdef".toCharArray();
        char[] result = new char[value.length * 2];
        for (int index = 0; index < value.length; index++) {
            int part = value[index] & 0xff;
            result[index * 2] = digits[part >>> 4];
            result[index * 2 + 1] = digits[part & 0x0f];
        }
        return new String(result);
    }

    private static void validate(
        byte[] sessionId, byte[] contextId, byte[] noncePrefix, long startingSequence
    ) {
        if (sessionId == null || sessionId.length != FramedSyncContract.IDENTIFIER_BYTES ||
            contextId == null || contextId.length != FramedSyncContract.DIGEST_BYTES ||
            noncePrefix == null || noncePrefix.length != 4 || startingSequence != 0) {
            throw new IllegalArgumentException("session_nonce_state_invalid");
        }
    }

    @Override public void close() { database.close(); }
}
