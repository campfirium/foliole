package com.foliole.android;

import java.io.FileDescriptor;
import java.io.RandomAccessFile;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;

/** Real JVM/native threads and file descriptors; Android's SAF UI is tested on A5. */
public final class FolioleFolderBackupOperation {
    private final Path root;
    private String fingerprint, pending;
    private int releases;
    private FolioleFolderBackupOperation(Path root) { this.root = root; }
    private native long createNative(String source, String expected, String pending);
    private native String[] runNative(long handle);
    private native void cancelNative(long handle);
    private native void destroyNative(long handle);
    public int openFile(String name, int flags) throws Exception {
        if (!FolioleFolderBackupDocumentNames.canOpen(name)) throw new IllegalArgumentException("WAL target rejected");
        Path path = target(name);
        if (!Files.exists(path) && (flags & 4) == 0) return -1;
        RandomAccessFile file = new RandomAccessFile(path.toFile(), (flags & 1) != 0 ? "r" : "rw");
        Field field = FileDescriptor.class.getDeclaredField("fd");
        field.setAccessible(true);
        int descriptor = field.getInt(file.getFD());
        field.setInt(file.getFD(), -1); // Transfer ownership exactly as ParcelFileDescriptor.detachFd does.
        file.close();
        return descriptor;
    }
    public boolean deleteFile(String name) throws Exception { Files.deleteIfExists(target(name)); return true; }
    public boolean exists(String name) { return Files.exists(target(name)); }
    private Path target(String name) {
        return root.resolve(FolioleFolderBackupDocumentNames.resolve(name, "Foliole.sqlite"));
    }
    public void snapshotPrepared(String value) throws Exception {
        Files.writeString(root.resolve("private-pending"), value);
        pending = value;
    }
    public void transactionCommitted() { fingerprint = pending; pending = null; }
    public void sourceReleased() { releases++; }
    private String[] run(boolean cancel) {
        long handle = createNative(root.resolve("source.db").toString(), fingerprint, pending);
        if (handle == 0) throw new AssertionError("create failed");
        try {
            if (cancel) cancelNative(handle);
            return runNative(handle);
        } finally { destroyNative(handle); }
    }
    public static void main(String[] args) throws Exception {
        System.load(args[0]);
        Path root = Path.of(args[1]);
        FolioleFolderBackupOperation worker = new FolioleFolderBackupOperation(root);
        String[] first = worker.run(false);
        if (!first[0].equals("0") || !first[1].equals("1")) throw new AssertionError(String.join("/", first));
        new ProcessBuilder("python3", "-c", "import sqlite3,sys;d=sqlite3.connect(sys.argv[1]);d.execute(\"UPDATE facts SET value='updated'\");d.commit()", root.resolve("source.db").toString()).inheritIO().start().waitFor();
        String[] delta = worker.run(false);
        if (!delta[0].equals("0") || Integer.parseInt(delta[4]) >= 10) throw new AssertionError(String.join("/", delta));
        String[] cancelled = worker.run(true);
        if (cancelled[0].equals("0") || !cancelled[1].equals("0") || worker.releases != 3) throw new AssertionError("cancel or source release failed");
        System.out.println("{\"initialPages\":" + first[4] + ",\"changedPages\":" + delta[4] + ",\"sourceReleases\":" + worker.releases + "}");
    }
}
