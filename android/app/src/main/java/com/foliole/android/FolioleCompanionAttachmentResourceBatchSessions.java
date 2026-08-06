package com.foliole.android;

import com.getcapacitor.JSArray;

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

    static synchronized void markStaged(String token, JSArray manifest, Map<String, File> createdFiles) {
        Session session = SESSIONS.get(token);
        if (session != null) {
            session.stagedManifest = manifest;
            session.stagedCreatedFiles = createdFiles;
        }
    }

    static synchronized void finish(String token, boolean committed) {
        Session session = SESSIONS.remove(token);
        if (session == null) return;
        if (!committed && session.stagedCreatedFiles != null) {
            for (File file : session.stagedCreatedFiles.values()) file.delete();
        }
        for (File file : session.tempFilesById.values()) file.delete();
    }

    static final class Session {
        final Map<String, String> contentHashesById;
        final List<String> failedIds;
        final Map<String, File> tempFilesById;
        JSArray stagedManifest;
        Map<String, File> stagedCreatedFiles;
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
