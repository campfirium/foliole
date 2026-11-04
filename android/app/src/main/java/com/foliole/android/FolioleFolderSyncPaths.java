package com.foliole.android;

final class FolioleFolderSyncPaths {
    static final int MAX_BRIDGE_BYTES = 2 * 1024 * 1024;
    private FolioleFolderSyncPaths() {}

    static String[] parts(String key) {
        if (key == null || !(key.matches("folder-sync/(objects/[a-f0-9]{64}\\.pb|checkpoint-[01]\\.json)")
                || key.matches("attachments/([a-f0-9]{64}\\.(png|jpg|gif|webp|pdf|epub|pdftext)|partial-[a-f0-9]{64})"))) {
            throw new IllegalArgumentException("folder_sync_path_invalid");
        }
        return key.split("/");
    }

    static boolean partial(String key) { return key != null && key.matches("attachments/partial-[a-f0-9]{64}"); }
}
