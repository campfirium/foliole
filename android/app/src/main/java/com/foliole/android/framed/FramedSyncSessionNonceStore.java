package com.foliole.android.framed;

public interface FramedSyncSessionNonceStore {
    void persistBeforeEncryption(
        byte[] sessionId, byte[] contextId, byte[] noncePrefix, long startingSequence
    ) throws Exception;
}
