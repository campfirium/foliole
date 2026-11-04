package com.foliole.android;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

/** Only descendants of the user-granted tree can be addressed. No filesystem paths are accepted. */
final class FolioleFolderSyncDocuments {
    private final ContentResolver resolver;
    private final Uri tree;

    FolioleFolderSyncDocuments(ContentResolver resolver, Uri tree) { this.resolver = resolver; this.tree = tree; }

    Uri resolve(String key, boolean create) throws Exception {
        String[] parts = FolioleFolderSyncPaths.parts(key);
        Uri current = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        for (int i = 0; i < parts.length; i++) {
            boolean directory = i < parts.length - 1;
            Uri next = child(current, parts[i], directory);
            if (next == null && create) {
                next = DocumentsContract.createDocument(resolver, current,
                    directory ? DocumentsContract.Document.MIME_TYPE_DIR : "application/octet-stream", parts[i]);
                if (next == null) throw new IllegalStateException("folder_sync_create_failed");
            }
            if (next == null) return null;
            current = next;
        }
        return current;
    }

    private Uri child(Uri parent, String name, boolean directory) throws Exception {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(parent));
        String[] columns = { DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE };
        Uri found = null;
        try (Cursor cursor = resolver.query(children, columns,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME + " = ?", new String[] { name }, null)) {
            if (cursor == null) throw new IllegalStateException("folder_sync_query_failed");
            while (cursor.moveToNext()) {
                // Providers may ignore selection; never accept a different display name or ambiguous duplicates.
                if (!name.equals(cursor.getString(1))) continue;
                if (found != null || directory != DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2))) {
                    throw new IllegalStateException("folder_sync_document_ambiguous");
                }
                found = DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
            }
        }
        return found;
    }

    byte[] read(String key) throws Exception {
        Uri file = resolve(key, false);
        if (file == null) return null;
        try (InputStream input = openRead(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > FolioleFolderSyncPaths.MAX_BRIDGE_BYTES) throw new IllegalStateException("folder_sync_read_limit");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    void write(String key, byte[] bytes) throws Exception {
        if (!key.startsWith("folder-sync/") || bytes.length > FolioleFolderSyncPaths.MAX_BRIDGE_BYTES) {
            throw new IllegalArgumentException("folder_sync_write_limit");
        }
        try (OutputStream output = openWrite(resolve(key, true), "wt")) { output.write(bytes); }
    }

    Info stat(String key) throws Exception {
        Uri file = resolve(key, false);
        if (file == null) return new Info(false, 0, "");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long length = 0;
        try (InputStream input = openRead(file)) {
            byte[] buffer = new byte[256 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) { length += count; digest.update(buffer, 0, count); }
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format("%02x", value));
        return new Info(true, length, hex.toString());
    }

    void truncate(String key, long length) throws Exception {
        if (!FolioleFolderSyncPaths.partial(key) || length < 0) throw new IllegalArgumentException("folder_sync_partial_invalid");
        Uri file = resolve(key, true);
        android.os.ParcelFileDescriptor descriptor = resolver.openFileDescriptor(file, "rw");
        if (descriptor == null) throw new IllegalStateException("folder_sync_open_failed");
        try (android.os.ParcelFileDescriptor.AutoCloseOutputStream output = new android.os.ParcelFileDescriptor.AutoCloseOutputStream(descriptor)) {
            if (output.getChannel().size() < length) throw new IllegalStateException("folder_sync_partial_truncated");
            output.getChannel().truncate(length);
        }
    }

    void append(String key, long offset, byte[] bytes) throws Exception {
        if (!FolioleFolderSyncPaths.partial(key) || bytes.length > 512 * 1024 || offset < 0) {
            throw new IllegalArgumentException("folder_sync_partial_invalid");
        }
        if (length(key) != offset) throw new IllegalStateException("folder_sync_partial_length_changed");
        try (OutputStream output = openWrite(resolve(key, true), "wa")) { output.write(bytes); }
        if (length(key) != offset + bytes.length) throw new IllegalStateException("folder_sync_append_incomplete");
    }

    long length(String key) throws Exception {
        Uri file = resolve(key, false);
        if (file == null) return 0;
        try (Cursor cursor = resolver.query(file, new String[] { DocumentsContract.Document.COLUMN_SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0) && cursor.getLong(0) >= 0) return cursor.getLong(0);
        }
        long size = 0;
        try (InputStream input = openRead(file)) {
            byte[] buffer = new byte[256 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) size += count;
        }
        return size;
    }

    void publish(String key) throws Exception {
        if (!key.matches("attachments/[a-f0-9]{64}\\.(png|jpg|gif|webp|pdf|epub|pdftext)")) {
            throw new IllegalArgumentException("folder_sync_resource_invalid");
        }
        String hash = key.substring("attachments/".length(), "attachments/".length() + 64);
        Info existing = stat(key);
        if (existing.present && existing.hash.equals(hash)) return;
        String partial = "attachments/partial-" + hash;
        Info source = stat(partial);
        if (!source.present || !source.hash.equals(hash)) throw new IllegalStateException("folder_sync_resource_corrupt");
        try (InputStream input = openRead(resolve(partial, false)); OutputStream output = openWrite(resolve(key, true), "wt")) {
            byte[] buffer = new byte[256 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        Info written = stat(key);
        if (written.length != source.length || !written.hash.equals(hash)) throw new IllegalStateException("folder_sync_publish_incomplete");
        remove(partial);
    }

    void remove(String key) throws Exception {
        if (!FolioleFolderSyncPaths.partial(key)) throw new IllegalArgumentException("folder_sync_removal_unsupported");
        Uri file = resolve(key, false);
        if (file != null && !DocumentsContract.deleteDocument(resolver, file)) throw new IllegalStateException("folder_sync_remove_failed");
    }

    private InputStream openRead(Uri uri) throws Exception {
        InputStream input = resolver.openInputStream(uri);
        if (input == null) throw new IllegalStateException("folder_sync_open_failed");
        return input;
    }

    private OutputStream openWrite(Uri uri, String mode) throws Exception {
        OutputStream output = resolver.openOutputStream(uri, mode);
        if (output == null) throw new IllegalStateException("folder_sync_open_failed");
        return output;
    }

    static final class Info {
        final boolean present;
        final long length;
        final String hash;
        Info(boolean present, long length, String hash) { this.present = present; this.length = length; this.hash = hash; }
    }
}
