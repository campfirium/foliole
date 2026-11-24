package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import java.io.FileNotFoundException;

class FolioleFolderBackupDocuments {
    private final Context context;
    final Uri tree;
    private final String filename;
    private volatile String snapshotName;

    FolioleFolderBackupDocuments(Context context, Uri tree) throws Exception {
        this.context = context;
        this.tree = tree;
        filename = FolioleCompanionBridgeContractDefinitions.hostApiString(context, "folderBackup", "databaseFileName");
        snapshotName = filename;
    }
    private Uri root() {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }
    private String name(String virtualPath) {
        return FolioleFolderBackupDocumentNames.resolve(virtualPath, snapshotName);
    }
    Uri find(String name) throws Exception {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Uri found = null;
        try (Cursor rows = context.getContentResolver().query(children,
            new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_DOCUMENT_ID }, null, null, null)) {
            if (rows == null) throw new IllegalStateException("Cannot read backup directory.");
            while (rows.moveToNext()) if (name.equals(rows.getString(0))) {
                if (found != null) throw new IllegalStateException("Backup directory contains duplicate filenames.");
                found = DocumentsContract.buildDocumentUriUsingTree(tree, rows.getString(1));
            }
        }
        return found;
    }
    FolioleFolderBackupReplacement replacement(String profileId) {
        return new FolioleFolderBackupReplacement(this, filename, profileId);
    }
    Uri foreignTarget(boolean owned, boolean creationPending) throws Exception {
        if (owned) return null;
        Uri target = find(filename);
        return target != null && (!creationPending || !isEmpty(target)) ? target : null;
    }
    void useSnapshotName(String next) { snapshotName = next == null ? filename : next; }

    void prepare(boolean owned, boolean creationPending, Runnable persistCreation, Runnable persistOwnership,
        Runnable forgetMissingTarget) throws Exception {
        Uri document = find(filename);
        if (document != null && !owned) {
            if (!creationPending || !isEmpty(document)) {
                throw new IllegalStateException("This folder already contains an unrecognized backup file. Choose another folder.");
            }
            persistOwnership.run();
        }
        if (document == null) {
            // The retained backup was removed from its folder. Nothing is left to protect, so forget its
            // identity first (an empty target may only be written without an expected fingerprint) and
            // create a new full backup in the same folder.
            if (owned) forgetMissingTarget.run();
            persistCreation.run();
            create(filename);
            persistOwnership.run();
        }
    }
    Uri create(String name) throws Exception {
        Uri created = DocumentsContract.createDocument(context.getContentResolver(), root(), "application/octet-stream", name);
        if (!isNamedDocument(created, name)) throw new IllegalStateException("Cannot create backup document " + name + ".");
        return created;
    }
    void rename(Uri document, String name) throws Exception {
        requireFile(document);
        if (find(name) != null) throw new IllegalStateException("Backup document already exists: " + name);
        Uri moved = DocumentsContract.renameDocument(context.getContentResolver(), document, name);
        if (!isNamedDocument(moved, name)) throw new IllegalStateException("Cannot rename backup document to " + name + ".");
    }
    private boolean isNamedDocument(Uri document, String name) throws Exception {
        Uri found = document == null ? null : find(name);
        return found != null && DocumentsContract.getDocumentId(document).equals(DocumentsContract.getDocumentId(found));
    }
    void delete(String name) throws Exception {
        Uri found = find(name);
        if (found == null) return;
        requireFile(found);
        if (!DocumentsContract.deleteDocument(context.getContentResolver(), found)) {
            throw new IllegalStateException("Cannot remove backup document " + name + ".");
        }
    }
    private void requireFile(Uri document) {
        String type = context.getContentResolver().getType(document);
        if (type == null || DocumentsContract.Document.MIME_TYPE_DIR.equals(type)) {
            throw new IllegalStateException("Invalid backup document type.");
        }
    }
    boolean isEmpty(Uri document) throws Exception {
        try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(document, "r")) {
            return descriptor != null && descriptor.getStatSize() == 0;
        }
    }
    public int openFile(String virtualPath, int flags) throws Exception {
        if (!FolioleFolderBackupDocumentNames.canOpen(virtualPath)) throw new FileNotFoundException("Backup target must use rollback journaling.");
        String name = name(virtualPath);
        Uri document = find(name);
        if (document == null && (flags & 4) != 0) {
            document = DocumentsContract.createDocument(context.getContentResolver(), root(), "application/octet-stream", name);
        }
        if (document == null) throw new FileNotFoundException(name);
        ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(document, (flags & 1) != 0 ? "r" : "rw");
        if (descriptor == null) throw new FileNotFoundException(name);
        try { return descriptor.detachFd(); } finally { descriptor.close(); }
    }
    public boolean deleteFile(String virtualPath) throws Exception {
        Uri document = find(name(virtualPath));
        return document == null || DocumentsContract.deleteDocument(context.getContentResolver(), document);
    }
    public boolean exists(String virtualPath) throws Exception { return find(name(virtualPath)) != null; }
}
