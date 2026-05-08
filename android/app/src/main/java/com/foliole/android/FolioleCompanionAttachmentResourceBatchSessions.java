package com.foliole.android;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class FolioleCompanionAttachmentResourceBatchSessions {
    private static final Map<String, Session> SESSIONS = new HashMap<>();

    private FolioleCompanionAttachmentResourceBatchSessions() {}

    static synchronized String create(
        Map<String, File> tempFilesById,
        Map<String, String> contentHashesById,
        List<String> failedIds
    ) {
        String token = UUID.randomUUID().toString();
        SESSIONS.put(token, new Session(tempFilesById, contentHashesById, failedIds));
        return token;
    }

    static synchronized Session get(String token) {
        return SESSIONS.get(token);
    }

    static synchronized void markCommitted(String token, List<String> syncedIds) {
        Session session = SESSIONS.get(token);
        if (session != null) session.markCommitted(syncedIds);
    }

    static final class Session {
        final Map<String, String> contentHashesById;
        final List<String> failedIds;
        final Map<String, File> tempFilesById;
        private List<String> committedIds;

        Session(Map<String, File> tempFilesById, Map<String, String> contentHashesById, List<String> failedIds) {
            this.contentHashesById = contentHashesById;
            this.failedIds = failedIds;
            this.tempFilesById = tempFilesById;
        }

        boolean committed() {
            return committedIds != null;
        }

        List<String> committedIds() {
            return committedIds;
        }

        void markCommitted(List<String> syncedIds) {
            committedIds = syncedIds;
        }
    }
}
