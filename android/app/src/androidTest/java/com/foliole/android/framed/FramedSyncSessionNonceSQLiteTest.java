package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.database.sqlite.SQLiteDatabase;
import org.junit.Test;

public final class FramedSyncSessionNonceSQLiteTest {
    @Test public void permitsIdenticalReplayButRejectsNonceReuse() throws Exception {
        try (FramedSyncSessionNonceSQLite store =
                 new FramedSyncSessionNonceSQLite(SQLiteDatabase.create(null))) {
            byte[] sessionId = bytes(16, 1);
            byte[] contextId = bytes(32, 2);
            byte[] nonce = bytes(4, 3);
            store.persistBeforeEncryption(sessionId, contextId, nonce, 0);
            store.persistBeforeEncryption(sessionId, contextId, nonce, 0);
            try {
                store.persistBeforeEncryption(sessionId, contextId, bytes(4, 4), 0);
                fail("expected nonce reuse rejection");
            } catch (FramedSyncValidationException expected) {
                assertEquals("session_nonce_reuse_detected", expected.code());
            }
        }
    }

    private static byte[] bytes(int length, int value) {
        byte[] result = new byte[length];
        java.util.Arrays.fill(result, (byte) value);
        return result;
    }
}
