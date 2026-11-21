package com.foliole.android;

/**
 * Maps archive entry names onto the folder backup layout. A zip made from the backup folder
 * may hold the files at its root or inside one enclosing folder; every backup file must
 * share that one location, and unsafe or foreign entries never reach the staging area.
 */
final class FolioleBackupRestoreArchiveLayout {
    enum Kind { DATABASE, SIDECAR, ATTACHMENT, IGNORED }

    static final class Entry {
        final Kind kind;
        final String name;
        Entry(Kind kind, String name) { this.kind = kind; this.name = name; }
    }

    static final String ATTACHMENT_FOLDER = "Attachments";
    private final String databaseName;
    private String prefix;

    FolioleBackupRestoreArchiveLayout(String databaseName) { this.databaseName = databaseName; }

    Entry classify(String rawName) {
        String path = rawName.replace('\\', '/');
        if (path.startsWith("/") || path.matches("^[A-Za-z]:/.*")) throw new IllegalStateException("restore_unsafe_archive");
        if (path.endsWith("/")) return ignored();
        String[] parts = path.split("/");
        for (String part : parts) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) throw new IllegalStateException("restore_unsafe_archive");
        }
        if (parts[0].equals("__MACOSX")) return ignored();
        String last = parts[parts.length - 1];
        if (last.startsWith("._") || last.startsWith(".foliole-")) return ignored();
        if (parts.length <= 2 && isDatabaseFile(last)) {
            claim(parts.length == 2 ? parts[0] : "");
            return new Entry(last.equals(databaseName) ? Kind.DATABASE : Kind.SIDECAR, last);
        }
        if (parts.length >= 2 && parts.length <= 3 && parts[parts.length - 2].equals(ATTACHMENT_FOLDER)) {
            claim(parts.length == 3 ? parts[0] : "");
            return new Entry(Kind.ATTACHMENT, last);
        }
        return ignored();
    }

    private boolean isDatabaseFile(String name) {
        return name.equals(databaseName) || name.equals(databaseName + "-journal") || name.equals(databaseName + "-wal");
    }

    private void claim(String location) {
        if (prefix == null) prefix = location;
        else if (!prefix.equals(location)) throw new IllegalStateException("restore_multiple_backups");
    }

    private static Entry ignored() { return new Entry(Kind.IGNORED, null); }
}
