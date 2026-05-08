package com.foliole.android;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class FolioleCompanionContentBlobBatchSessions {
    private static final Map<String, Session> SESSIONS = new HashMap<>();

    private FolioleCompanionContentBlobBatchSessions() {}

    static synchronized String create(List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs, List<String> failedHashes) {
        String token = UUID.randomUUID().toString();
        SESSIONS.put(token, new Session(blobs, failedHashes));
        return token;
    }

    static synchronized Session get(String token) {
        return SESSIONS.get(token);
    }

    static synchronized void markCommitted(String token, List<String> syncedHashes) {
        Session session = SESSIONS.get(token);
        if (session != null) session.markCommitted(syncedHashes);
    }

    static final class Session {
        final List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs;
        final List<String> failedHashes;
        private List<String> committedHashes;

        Session(List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs, List<String> failedHashes) {
            this.blobs = blobs;
            this.failedHashes = failedHashes;
        }

        boolean committed() {
            return committedHashes != null;
        }

        List<String> committedHashes() {
            return committedHashes;
        }

        void markCommitted(List<String> syncedHashes) {
            committedHashes = syncedHashes;
        }
    }
}
