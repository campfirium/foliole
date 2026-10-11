package com.foliole.android.framed;

import android.content.Context;
import org.json.JSONObject;

public final class FramedSyncSessionNonceFiles implements FramedSyncSessionNonceStore, AutoCloseable {
    private final Context host;
    public FramedSyncSessionNonceFiles(Context host) { this.host = host.getApplicationContext(); }

    @Override public synchronized void persistBeforeEncryption(byte[] session, byte[] context, byte[] nonce, long sequence) throws Exception {
        if (session == null || session.length != 16 || context == null || context.length != 32 ||
            nonce == null || nonce.length != 4 || sequence != 0) throw new IllegalArgumentException("session_nonce_state_invalid");
        var owner = FramedSyncPayloadBudgetRegistry.current();
        if (owner.isClosed()) throw new IllegalStateException("framed_sync_file_owner_mismatch");
        var files = new FramedSyncFiles(host, owner.libraryKey());
        String key = "sessions/" + FramedSyncResourceFiles.hex(session) + ".json";
        JSONObject value = new JSONObject().put("sessionId", FramedSyncFileRecords.bytes(session))
            .put("contextId", FramedSyncFileRecords.bytes(context)).put("noncePrefix", FramedSyncFileRecords.bytes(nonce))
            .put("startingSequence", Long.toUnsignedString(sequence)).put("state", "prepared");
        JSONObject prior = FramedSyncFileRecords.read(files, key);
        if (prior != null) {
            prior.put("state", "prepared");
            if (!FramedSyncFileRecords.same(prior, value)) throw new FramedSyncValidationException("session_nonce_reuse_detected");
            return;
        }
        FramedSyncFileRecords.write(files, key, value);
    }
    @Override public void close() {}
}
