package com.foliole.android;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class FolioleCompanionContentBlobBatchSessions {
    private static final Map<String, Session> SESSIONS = new HashMap<>();

    private FolioleCompanionContentBlobBatchSessions() {}

    static synchronized String create(File pack, List<String> failedHashes) {
        String token = UUID.randomUUID().toString();
        SESSIONS.put(token, new Session(pack, failedHashes));
        return token;
    }

    static synchronized Session get(String token) {
        return SESSIONS.get(token);
    }

    static synchronized void markCommitted(String token, List<String> syncedHashes) {
        Session session = SESSIONS.get(token);
        if (session != null) {
            FolioleCompanionContentBlobPack.delete(session.pack);
            session.markCommitted(syncedHashes);
        }
    }

    static synchronized void discard(String token) {
        Session session = SESSIONS.remove(token);
        if (session != null) FolioleCompanionContentBlobPack.delete(session.pack);
    }

    static synchronized void finish(String token) {
        discard(token);
    }

    static final class Session {
        final List<String> failedHashes;
        final File pack;
        private List<String> committedHashes;

        Session(File pack, List<String> failedHashes) {
            this.pack = pack;
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
