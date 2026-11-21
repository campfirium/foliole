package com.foliole.android;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Reads a user-chosen backup zip or folder through the Storage Access Framework into staging. */
final class FolioleBackupRestoreSources {
    private static final long SPACE_MARGIN = 64L * 1024 * 1024;

    private static final class Child {
        final String name, id, mime;
        final long size;
        Child(String name, String id, String mime, long size) { this.name = name; this.id = id; this.mime = mime; this.size = size; }
        boolean directory() { return DocumentsContract.Document.MIME_TYPE_DIR.equals(mime); }
    }

    private FolioleBackupRestoreSources() {}

    static void readZip(Context context, Uri zip, String databaseName, FolioleBackupRestoreStaging staging) throws Exception {
        requireSpace(context, openableSize(context.getContentResolver(), zip));
        FolioleBackupRestoreArchiveLayout layout = new FolioleBackupRestoreArchiveLayout(databaseName);
        try (InputStream raw = open(context.getContentResolver(), zip); ZipInputStream input = new ZipInputStream(raw)) {
            ZipEntry entry;
            boolean any = false;
            while ((entry = input.getNextEntry()) != null) {
                any = true;
                FolioleBackupRestoreArchiveLayout.Entry mapped = layout.classify(entry.getName());
                if (mapped.kind == FolioleBackupRestoreArchiveLayout.Kind.DATABASE) staging.database(input);
                else if (mapped.kind == FolioleBackupRestoreArchiveLayout.Kind.SIDECAR) staging.sidecar(input);
                else if (mapped.kind == FolioleBackupRestoreArchiveLayout.Kind.ATTACHMENT) staging.attachment(mapped.name, input);
            }
            if (!any) throw new IllegalStateException("restore_not_archive");
        } catch (java.util.zip.ZipException error) {
            throw new IllegalStateException("restore_not_archive", error);
        }
        staging.finish();
    }

    static void readFolder(Context context, Uri tree, String databaseName, FolioleBackupRestoreStaging staging) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        List<Child> root = children(resolver, tree, DocumentsContract.getTreeDocumentId(tree));
        Child database = null, attachmentFolder = null;
        long size = 0;
        for (Child child : root) {
            if (child.name.equals(databaseName) && !child.directory()) { database = child; size += child.size; }
            if (child.name.equals(FolioleBackupRestoreArchiveLayout.ATTACHMENT_FOLDER) && child.directory()) attachmentFolder = child;
        }
        if (database == null) throw new IllegalStateException("restore_not_backup");
        List<Child> attachments = attachmentFolder == null ? new ArrayList<>() : children(resolver, tree, attachmentFolder.id);
        for (Child child : attachments) size += child.size;
        requireSpace(context, size);
        for (Child child : root) {
            if (!child.directory() && (child.name.equals(databaseName + "-journal") || child.name.equals(databaseName + "-wal"))) {
                try (InputStream input = open(resolver, document(tree, child))) { staging.sidecar(input); }
            }
        }
        try (InputStream input = open(resolver, document(tree, database))) { staging.database(input); }
        for (Child child : attachments) {
            if (child.directory()) continue;
            try (InputStream input = open(resolver, document(tree, child))) { staging.attachment(child.name, input); }
        }
        staging.finish();
    }

    static String label(Context context, Uri uri, boolean tree) {
        if (tree) return DocumentsContract.getTreeDocumentId(uri);
        try (Cursor rows = context.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            return rows != null && rows.moveToFirst() ? rows.getString(0) : uri.getLastPathSegment();
        }
    }

    private static List<Child> children(ContentResolver resolver, Uri tree, String parentId) {
        Uri uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        List<Child> result = new ArrayList<>();
        try (Cursor rows = resolver.query(uri, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE }, null, null, null)) {
            if (rows == null) throw new IllegalStateException("restore_source_unreadable");
            while (rows.moveToNext()) {
                result.add(new Child(rows.getString(0), rows.getString(1), rows.getString(2), rows.isNull(3) ? 0 : rows.getLong(3)));
            }
        }
        return result;
    }

    private static Uri document(Uri tree, Child child) { return DocumentsContract.buildDocumentUriUsingTree(tree, child.id); }

    private static InputStream open(ContentResolver resolver, Uri uri) throws Exception {
        InputStream input = resolver.openInputStream(uri);
        if (input == null) throw new IllegalStateException("restore_source_unreadable");
        return input;
    }

    private static long openableSize(ContentResolver resolver, Uri uri) {
        try (Cursor rows = resolver.query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            return rows != null && rows.moveToFirst() && !rows.isNull(0) ? rows.getLong(0) : 0;
        }
    }

    private static void requireSpace(Context context, long needed) {
        File files = context.getFilesDir();
        if (needed + SPACE_MARGIN > files.getUsableSpace()) throw new IllegalStateException("restore_insufficient_space:" + needed);
    }
}
