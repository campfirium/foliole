package com.foliole.android;

import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class FolderAttachmentCopyFixture {
    static String digest(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", b & 255));
        return hex.toString();
    }
    static String key(byte[] bytes) throws Exception { return digest(bytes) + ".png"; }
    static byte[] bytes(String text) { return text.getBytes(java.nio.charset.StandardCharsets.UTF_8); }

    /** A provider folder on disk whose document ids are file names; it counts every provider round trip. */
    static final class Documents implements FolioleFolderBackupAttachmentCopy.Documents {
        final Path folder;
        int listings, creates, renames, reads, syncs;
        boolean failWrite, failPublish;
        final List<String[]> extraChildren = new ArrayList<>();
        Runnable beforeRename = () -> {};
        Documents(Path folder) { this.folder = folder; }
        public List<String[]> children() throws Exception {
            listings++;
            List<String[]> result = new ArrayList<>(extraChildren);
            try (DirectoryStream<Path> files = Files.newDirectoryStream(folder)) {
                for (Path file : files) result.add(new String[] { file.getFileName().toString(), file.getFileName().toString() });
            }
            return result;
        }
        public String create(String name) throws Exception { creates++; Files.createFile(folder.resolve(name)); return name; }
        public void write(String id, FolioleFolderBackupAttachmentCopy.StreamWriter writer) throws Exception {
            try (FileOutputStream output = new FileOutputStream(folder.resolve(id).toFile())) {
                writer.write(new FilterOutputStream(output) {
                    @Override public void write(byte[] bytes, int offset, int count) throws IOException {
                        if (failWrite) throw new IOException("out of space");
                        out.write(bytes, offset, count);
                    }
                });
                output.getFD().sync(); syncs++;
            }
        }
        public InputStream read(String id) throws Exception { reads++; return Files.newInputStream(folder.resolve(id)); }
        public String rename(String id, String name) throws Exception {
            renames++;
            if (failPublish) throw new IOException("provider denied rename");
            beforeRename.run();
            // Like ExternalStorageProvider: a clashing name is kept by choosing a unique one, never replaced.
            String chosen = name;
            for (int index = 1; Files.exists(folder.resolve(chosen)); index++) chosen = name + " (" + index + ")";
            Files.move(folder.resolve(id), folder.resolve(chosen));
            return chosen;
        }
        public String displayName(String id) { return id; }
        public void delete(String id) throws Exception { Files.delete(folder.resolve(id)); }
        boolean partials() throws Exception {
            try (DirectoryStream<Path> files = Files.newDirectoryStream(folder, "*.partial")) { return files.iterator().hasNext(); }
        }
    }

    static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    static boolean copy(Documents documents, String key, byte[] bytes, AtomicBoolean cancelled) throws Exception {
        return new FolioleFolderBackupAttachmentCopy.Folder(documents, "profile").copy(key, new ByteArrayInputStream(bytes), cancelled::get);
    }
    static void fails(Documents documents, String key, byte[] bytes) throws Exception {
        try { copy(documents, key, bytes, new AtomicBoolean()); throw new AssertionError("accepted failed copy"); }
        catch (IOException | IllegalStateException expected) { require(!documents.partials(), "partial left after failure"); }
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        Path folder = Files.createDirectories(root.resolve("Attachments"));
        Documents documents = new Documents(folder);

        // A batch lists the folder once and never reads a copy back, however many files it publishes.
        FolioleFolderBackupAttachmentCopy.Folder batch = new FolioleFolderBackupAttachmentCopy.Folder(documents, "profile");
        List<String> keys = new ArrayList<>();
        for (int index = 0; index < 40; index++) {
            byte[] content = bytes("attachment " + index);
            String key = key(content); keys.add(key);
            require(batch.copy(key, new ByteArrayInputStream(content), () -> false), "batch copy");
            require(Arrays.equals(Files.readAllBytes(folder.resolve(key)), content), "batch bytes");
        }
        require(documents.listings == 1, "one listing per batch, got " + documents.listings);
        require(documents.reads == 0, "no read-back, got " + documents.reads);
        require(documents.creates == 40 && documents.renames == 40 && documents.syncs == 40, "one create/sync/rename per file");
        // A key already published in the same batch is skipped by hash without another listing.
        require(!batch.copy(keys.get(0), new ByteArrayInputStream(bytes("attachment 0")), () -> false), "same-batch skip");
        require(documents.listings == 1 && documents.reads == 1, "same-batch skip reads only the existing file");

        byte[] content = bytes("an actual attachment");
        String key = key(content);
        Path target = folder.resolve(key);
        require(copy(documents, key, content, new AtomicBoolean()), "copy");
        long modified = Files.getLastModifiedTime(target).toMillis();
        require(!copy(documents, key, content, new AtomicBoolean()), "unchanged skip");
        require(Files.getLastModifiedTime(target).toMillis() == modified, "unchanged file untouched");
        // External changes must survive, even with a valid source still available.
        Files.write(target, new byte[] { 9 });
        fails(documents, key, content);
        require(Files.readAllBytes(target)[0] == 9, "external change kept");
        Files.delete(target);
        fails(documents, key, new byte[] { 2 });
        documents.failWrite = true; fails(documents, key, content); documents.failWrite = false;
        documents.failPublish = true; fails(documents, key, content); documents.failPublish = false;
        // Another writer takes the name after the listing: ours is removed, theirs is kept.
        documents.beforeRename = () -> {
            try { Files.write(target, new byte[] { 7 }); } catch (IOException error) { throw new UncheckedIOException(error); }
        };
        try { copy(documents, key, content, new AtomicBoolean()); throw new AssertionError("accepted clashing publish"); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("appeared"), "clash message"); }
        documents.beforeRename = () -> {};
        require(Files.readAllBytes(target)[0] == 7 && !Files.exists(folder.resolve(key + " (1)")) && !documents.partials(), "clash retention");
        Files.delete(target);
        // A stale partial left by a killed process is replaced.
        Files.write(folder.resolve(".foliole-profile-" + key + ".partial"), new byte[] { 1, 2 });
        require(copy(documents, key, content, new AtomicBoolean()) && !documents.partials(), "stale partial replaced");
        Files.delete(target);
        AtomicBoolean cancel = new AtomicBoolean();
        InputStream changing = new ByteArrayInputStream(content) {
            @Override public synchronized int read(byte[] b, int off, int len) {
                int count = super.read(b, off, len); cancel.set(true); return count;
            }
        };
        try {
            new FolioleFolderBackupAttachmentCopy.Folder(documents, "profile").copy(key, changing, cancel::get);
            throw new AssertionError("ignored cancellation");
        } catch (InterruptedException expected) { require(!documents.partials(), "partial after cancel"); }
        require(!Files.exists(target), "no publish after cancel");
        // Retry the same target after every failure; no intermediate reconstruction.
        require(copy(documents, key, content, new AtomicBoolean()), "retry");
        require(Arrays.equals(Files.readAllBytes(target), content), "retry bytes");

        // Deletion keeps cancelled and externally changed files, removes a verified one, and ignores a missing one.
        try { new FolioleFolderBackupAttachmentCopy.Folder(documents, "profile").delete(key, () -> true); throw new AssertionError(); }
        catch (InterruptedException expected) { require(Files.exists(target), "cancelled delete kept"); }
        Files.write(target, new byte[] { 9 });
        try { new FolioleFolderBackupAttachmentCopy.Folder(documents, "profile").delete(key, () -> false); throw new AssertionError(); }
        catch (IllegalStateException expected) { require(Files.readAllBytes(target)[0] == 9, "changed delete kept"); }
        Files.write(target, content);
        new FolioleFolderBackupAttachmentCopy.Folder(documents, "profile").delete(key, () -> false);
        require(!Files.exists(target), "verified delete");
        new FolioleFolderBackupAttachmentCopy.Folder(documents, "profile").delete(key, () -> false);

        // Duplicate provider names are never guessed between.
        documents.extraChildren.add(new String[] { keys.get(1), "duplicate" });
        try { copy(documents, keys.get(1), bytes("attachment 1"), new AtomicBoolean()); throw new AssertionError(); }
        catch (IllegalStateException expected) { require(expected.getMessage().contains("Duplicate"), "duplicate message"); }
        System.out.println("one listing per batch without read-back, unchanged skip, conflict retention, clashing publish, stale partial, source mutation, write/publish failures, cancellation, deletion and retry passed");
    }
}
