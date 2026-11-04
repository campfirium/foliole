package com.foliole.android;

final class FolioleFolderBackupDocumentNames {
    private static final String MAIN = "/foliole-backup/Foliole.sqlite";
    private FolioleFolderBackupDocumentNames() {}

    static String resolve(String virtualPath, String filename) {
        if (virtualPath.equals(MAIN)) return filename;
        for (String suffix : new String[] { "-journal", "-wal", "-shm" }) {
            if (virtualPath.equals(MAIN + suffix)) return filename + suffix;
        }
        throw new IllegalArgumentException("Invalid backup pager filename.");
    }
    static boolean canOpen(String virtualPath) {
        return virtualPath.equals(MAIN) || virtualPath.equals(MAIN + "-journal");
    }
}
