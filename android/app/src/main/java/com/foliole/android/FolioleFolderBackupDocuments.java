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

    FolioleFolderBackupDocuments(Context context, Uri tree) throws Exception {
        this.context = context;
        this.tree = tree;
        filename = FolioleCompanionBridgeContractDefinitions.hostApiString(context, "folderBackup", "databaseFileName");
    }
    private Uri root() {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }
    private String name(String virtualPath) {
        return FolioleFolderBackupDocumentNames.resolve(virtualPath, filename);
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
    void prepare(boolean owned, boolean creationPending, Runnable persistCreation, Runnable persistOwnership) throws Exception {
        Uri document = find(filename);
        if (document != null && !owned) {
            if (!creationPending || !isEmpty(document)) {
                throw new IllegalStateException("This folder already contains an unrecognized backup file. Choose another folder.");
            }
            persistOwnership.run();
        }
        if (document == null) {
            if (owned) throw new FileNotFoundException("Backup file is missing.");
            persistCreation.run();
            if (DocumentsContract.createDocument(context.getContentResolver(), root(), "application/octet-stream", filename) == null) {
                throw new IllegalStateException("Cannot create backup database.");
            }
            persistOwnership.run();
        }
    }
    private boolean isEmpty(Uri document) throws Exception {
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
