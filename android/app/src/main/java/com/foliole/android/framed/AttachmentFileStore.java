package com.foliole.android.framed;

import java.io.File;
import java.io.FileInputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native regular-file operations. No registry lock is held during reads, writes, or hashing. */
public final class AttachmentFileStore implements AutoCloseable {
    public interface Check { void run() throws Exception; }
    public interface Commit { boolean run(java.util.concurrent.Callable<Boolean> operation) throws Exception; }
    public static final int BLOCK_BYTES = 524288;
    public static final class Info {
        public final boolean present;
        public final long length;
        public Info(boolean present, long length) { this.present = present; this.length = length; }
    }
    private final File root;
    private RandomAccessFile carrier;
    private FileLock receiverLock;

    public AttachmentFileStore(File root) throws Exception {
        this.root = root.getCanonicalFile();
        Files.createDirectories(this.root.toPath());
    }
    public File root() { return root; }
    public File resolve(String key, boolean partial) throws Exception {
        if (key == null || !(partial ? key.matches("[a-f0-9]{64}(\\.(png|jpg|gif|webp|pdf|epub|pdftext))?")
            : key.matches("[a-f0-9]{64}\\.(png|jpg|gif|webp|pdf|epub|pdftext)"))) {
            throw new IllegalArgumentException("attachment_key_invalid");
        }
        File file = new File(root, partial ? ".attachment-" + key.substring(0, 64) + ".partial" : key);
        if (!file.getCanonicalPath().equals(file.getAbsolutePath())) throw new IllegalArgumentException("attachment_file_unsafe");
        return file;
    }
    public static File checked(File file) throws Exception {
        file = new File(file.getParentFile().getCanonicalFile(), file.getName());
        if (!file.isFile() || !file.getCanonicalPath().equals(file.getAbsolutePath())) {
            throw new IllegalArgumentException("attachment_file_unsafe");
        }
        return file;
    }
    public static Info info(File file) throws Exception {
        return file.exists() ? new Info(true, checked(file).length()) : new Info(false, 0);
    }
    public synchronized void acquire() throws Exception {
        if (receiverLock != null && receiverLock.isValid()) return;
        RandomAccessFile candidate = new RandomAccessFile(new File(root, ".attachment-receiver.lock"), "rw");
        try {
            FileLock acquired;
            try { acquired = candidate.getChannel().tryLock(); }
            catch (OverlappingFileLockException busy) { throw new IllegalStateException("attachment_receiver_busy", busy); }
            if (acquired == null) throw new IllegalStateException("attachment_receiver_busy");
            carrier = candidate; receiverLock = acquired;
        } finally { if (carrier != candidate) candidate.close(); }
    }
    public synchronized boolean acquired() { return receiverLock != null && receiverLock.isValid(); }
    public AutoCloseable lease(String key) throws Exception { resolve(key, true); return AttachmentFileLeases.acquire(root, key); }
    public Receive receive(String key, long offset, long partialLength, Check check) throws Exception {
        acquire();
        AutoCloseable lease = lease(key);
        try { return new Receive(resolve(key, true), offset, partialLength, check, lease); }
        catch (Exception error) { lease.close(); throw error; }
    }
    public static String digest(File file, String algorithm, Runnable check, Runnable progress) throws Exception {
        MessageDigest digest = MessageDigest.getInstance(algorithm);
        byte[] buffer = new byte[65536];
        check.run();
        try (FileInputStream input = new FileInputStream(checked(file))) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                check.run(); digest.update(buffer, 0, read); progress.run();
            }
        }
        check.run();
        StringBuilder result = new StringBuilder(64);
        for (byte value : digest.digest()) result.append(String.format("%02x", value));
        return result.toString();
    }
    /** The caller owns this canonical hash until the move has exited. */
    public static boolean publish(File source, File target, String hash, String algorithm,
        Runnable check, Runnable progress) throws Exception {
        return publish(source, target, hash, algorithm, check, progress, operation -> operation.call());
    }
    public static boolean publish(File source, File target, String hash, String algorithm,
        Runnable check, Runnable progress, Commit commit) throws Exception {
        if (!hash.equals(digest(source, algorithm, check, progress))) throw new IllegalStateException("attachment_hash_mismatch");
        if (target.exists() && hash.equals(digest(target, algorithm, check, progress))) {
            return commit.run(() -> { check.run(); Files.delete(source.toPath()); return false; });
        }
        return commit.run(() -> {
            check.run(); Files.move(source.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return true;
        });
    }
    @Override public synchronized void close() throws Exception {
        if (carrier != null) { carrier.close(); carrier = null; receiverLock = null; }
    }

    public static final class Receive implements AutoCloseable {
        private final RandomAccessFile file;
        private final Check check;
        private final AutoCloseable lease;
        private final AtomicBoolean closed = new AtomicBoolean();
        private boolean sealed;
        private Receive(File path, long offset, long partialLength, Check check, AutoCloseable lease) throws Exception {
            this.check = check; this.lease = lease;
            check.run(); file = new RandomAccessFile(path, "rw");
            try {
                if (offset < 0 || offset > partialLength || file.length() != partialLength) {
                    throw new IllegalArgumentException("attachment_partial_length_changed");
                }
                check.run(); file.setLength(offset); file.seek(offset);
            } catch (Exception error) { file.close(); throw error; }
        }
        public void append(long offset, ByteBuffer bytes) throws Exception {
            check.run();
            if (closed.get() || sealed || bytes.remaining() > BLOCK_BYTES || file.length() != offset || file.getFilePointer() != offset) {
                throw new IllegalArgumentException("attachment_partial_length_changed");
            }
            while (bytes.hasRemaining()) { check.run(); file.getChannel().write(bytes); }
        }
        public synchronized void seal() throws Exception {
            if (sealed) return;
            file.close(); sealed = true;
        }
        @Override public void close() throws Exception {
            if (!closed.compareAndSet(false, true)) return;
            try { seal(); } finally { lease.close(); }
        }
    }
}
