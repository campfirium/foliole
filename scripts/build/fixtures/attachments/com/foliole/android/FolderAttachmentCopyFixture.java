package com.foliole.android;

import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

public final class FolderAttachmentCopyFixture {
    static final byte[] BYTES = "an actual attachment".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    static final String HASH = "9c0a";
    static String digest(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", b & 255));
        return hex.toString();
    }
    static final class Target implements FolioleFolderBackupAttachmentCopy.Target {
        final Path finalFile, partial;
        boolean failWrite, failPublish, corruptTemporary;
        FileOutputStream output;
        Target(Path root) { finalFile = root.resolve("attachment.png"); partial = root.resolve(".partial"); }
        public InputStream existing() throws Exception { return Files.exists(finalFile) ? Files.newInputStream(finalFile) : null; }
        public OutputStream temporary() throws Exception {
            output = new FileOutputStream(partial.toFile());
            return new FilterOutputStream(output) {
                @Override public void write(byte[] bytes, int offset, int count) throws IOException {
                    if (failWrite) throw new IOException("out of space");
                    out.write(bytes, offset, count);
                }
            };
        }
        public void sync() throws Exception { output.getFD().sync(); }
        public InputStream readTemporary() throws Exception {
            if (corruptTemporary) Files.write(partial, new byte[] { 1 });
            return Files.newInputStream(partial);
        }
        public void publish() throws Exception {
            if (failPublish) throw new IOException("provider denied rename");
            Files.move(partial, finalFile);
        }
        public void discard() throws Exception { Files.deleteIfExists(partial); }
    }
    static boolean copy(Target target, byte[] bytes, AtomicBoolean cancelled) throws Exception {
        return FolioleFolderBackupAttachmentCopy.copy(digest(BYTES), new ByteArrayInputStream(bytes), target, cancelled::get);
    }
    static void require(boolean condition) { if (!condition) throw new AssertionError(); }
    static void fails(Target target, byte[] bytes) throws Exception {
        try { copy(target, bytes, new AtomicBoolean()); throw new AssertionError("accepted failed copy"); }
        catch (IOException | IllegalStateException expected) { require(!Files.exists(target.partial)); }
    }
    static void deletion(Target target) throws Exception {
        FolioleFolderBackupAttachmentCopy.DeletionTarget deleting = new FolioleFolderBackupAttachmentCopy.DeletionTarget() {
            public InputStream existing() throws Exception { return target.existing(); }
            public void remove() throws Exception { Files.delete(target.finalFile); }
        };
        AtomicBoolean cancelled = new AtomicBoolean(true);
        try { FolioleFolderBackupAttachmentCopy.delete(digest(BYTES), deleting, cancelled::get); throw new AssertionError(); }
        catch (InterruptedException expected) { require(Files.exists(target.finalFile)); }
        Files.write(target.finalFile, new byte[] {9});
        try { FolioleFolderBackupAttachmentCopy.delete(digest(BYTES), deleting, () -> false); throw new AssertionError(); }
        catch (IllegalStateException expected) { require(Files.readAllBytes(target.finalFile)[0] == 9); }
        Files.write(target.finalFile, BYTES);
        FolioleFolderBackupAttachmentCopy.delete(digest(BYTES), deleting, () -> false);
        require(!Files.exists(target.finalFile));
        FolioleFolderBackupAttachmentCopy.delete(digest(BYTES), deleting, () -> false);
    }
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        Target target = new Target(root);
        require(copy(target, BYTES, new AtomicBoolean()));
        require(java.util.Arrays.equals(Files.readAllBytes(target.finalFile), BYTES));
        long modified = Files.getLastModifiedTime(target.finalFile).toMillis();
        require(!copy(target, BYTES, new AtomicBoolean()));
        require(Files.getLastModifiedTime(target.finalFile).toMillis() == modified);
        // External changes must survive, even with a valid source still available.
        Files.write(target.finalFile, new byte[] { 9 });
        fails(target, BYTES);
        require(Files.readAllBytes(target.finalFile)[0] == 9);
        Files.delete(target.finalFile);
        fails(target, new byte[] { 2 });
        target.failWrite = true; fails(target, BYTES); target.failWrite = false;
        target.corruptTemporary = true; fails(target, BYTES); target.corruptTemporary = false;
        target.failPublish = true; fails(target, BYTES); target.failPublish = false;
        AtomicBoolean cancel = new AtomicBoolean();
        InputStream changing = new ByteArrayInputStream(BYTES) {
            @Override public synchronized int read(byte[] b, int off, int len) {
                int count = super.read(b, off, len); cancel.set(true); return count;
            }
        };
        try {
            FolioleFolderBackupAttachmentCopy.copy(digest(BYTES), changing, target, cancel::get);
            throw new AssertionError();
        } catch (InterruptedException expected) { require(!Files.exists(target.partial)); }
        require(!Files.exists(target.finalFile));
        // Retry the same target after every failure; no intermediate reconstruction.
        require(copy(target, BYTES, new AtomicBoolean()));
        require(java.util.Arrays.equals(Files.readAllBytes(target.finalFile), BYTES));
        deletion(target);
        System.out.println("verified file copy, unchanged skip, conflict retention, source mutation, write/readback/publish failures, cancellation and retry passed");
    }
}
