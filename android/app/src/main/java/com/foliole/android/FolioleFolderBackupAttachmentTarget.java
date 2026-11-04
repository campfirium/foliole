package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;

/** SAF and app-file adapter for a single canonical attachment. */
final class FolioleFolderBackupAttachmentTarget implements FolioleFolderBackupAttachmentCopy.Target {
    private final Context context;
    private final Uri tree, folder;
    private final String key, temporaryName;
    private Uri temporary;
    private ParcelFileDescriptor descriptor;

    static boolean copy(Context context, JSONObject profile, String key, BooleanSupplier cancelled) throws Exception {
        if (!FolioleCompanionCanonicalAttachmentKey.valid(key)) throw new IllegalArgumentException("Invalid attachment name.");
        File source = new File(FolioleAttachmentMaintenanceFiles.directory(context, false), key);
        if (!source.exists()) source = new File(FolioleAttachmentMaintenanceFiles.directory(context, true), key);
        source = FolioleAttachmentBlockFiles.checkedSourceFile(source);
        FolioleFolderBackupAttachmentTarget target = new FolioleFolderBackupAttachmentTarget(context, profile, key);
        try (InputStream input = new FileInputStream(source)) {
            return FolioleFolderBackupAttachmentCopy.copy(key.substring(0, 64), input, target, cancelled);
        }
    }
    static void delete(Context context, JSONObject profile, String key, BooleanSupplier cancelled) throws Exception {
        if (!FolioleCompanionCanonicalAttachmentKey.valid(key)) throw new IllegalArgumentException("Invalid attachment name.");
        // A failed deletion, local move, or a later restored source cannot authorize removing its backup.
        for (boolean trash : new boolean[] {false, true}) {
            File directory = FolioleAttachmentMaintenanceFiles.directory(context, trash);
            if (!directory.isDirectory() || !directory.canRead()) throw new IllegalStateException("Cannot read source attachment directory.");
            if (new File(directory, key).exists()) throw new IllegalStateException("Source attachment still exists.");
        }
        FolioleFolderBackupAttachmentTarget target = new FolioleFolderBackupAttachmentTarget(context, profile, key);
        FolioleFolderBackupAttachmentCopy.delete(key.substring(0, 64), new FolioleFolderBackupAttachmentCopy.DeletionTarget() {
            public InputStream existing() throws Exception { return target.existing(); }
            public void remove() throws Exception {
                Uri document = target.find(target.folder, key);
                if (document == null) return;
                if (!DocumentsContract.deleteDocument(context.getContentResolver(), document) || target.find(target.folder, key) != null) {
                    throw new IllegalStateException("Cannot remove backup attachment.");
                }
            }
        }, cancelled);
    }

    static void prepareDirectory(Context context, JSONObject profile) throws Exception {
        new FolioleFolderBackupAttachmentTarget(context, profile, "");
    }
    private FolioleFolderBackupAttachmentTarget(Context context, JSONObject profile, String key) throws Exception {
        this.context = context;
        this.key = key;
        tree = Uri.parse(profile.getString("tree"));
        Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Uri found = find(root, "Attachments");
        folder = found == null ? DocumentsContract.createDocument(context.getContentResolver(), root,
            DocumentsContract.Document.MIME_TYPE_DIR, "Attachments") : found;
        if (folder == null) throw new IllegalStateException("Cannot create attachment backup folder.");
        temporaryName = ".foliole-" + profile.getString("id") + "-" + key + ".partial";
    }
    private Uri find(Uri parent, String name) throws Exception {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(parent));
        Uri found = null;
        try (Cursor rows = context.getContentResolver().query(children, new String[] {
            DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_DOCUMENT_ID }, null, null, null)) {
            if (rows == null) throw new IllegalStateException("Cannot read attachment backup folder.");
            while (rows.moveToNext()) if (name.equals(rows.getString(0))) {
                if (found != null) throw new IllegalStateException("Duplicate attachment filenames in backup folder.");
                found = DocumentsContract.buildDocumentUriUsingTree(tree, rows.getString(1));
            }
        }
        return found;
    }
    @Override public InputStream existing() throws Exception {
        Uri file = find(folder, key);
        return file == null ? null : read(file);
    }
    private InputStream read(Uri file) throws Exception {
        InputStream input = context.getContentResolver().openInputStream(file);
        if (input == null) throw new IllegalStateException("Cannot read backup attachment.");
        return input;
    }
    @Override public OutputStream temporary() throws Exception {
        temporary = find(folder, temporaryName);
        if (temporary != null) discard();
        temporary = DocumentsContract.createDocument(context.getContentResolver(), folder, "application/octet-stream", temporaryName);
        if (temporary == null) throw new IllegalStateException("Cannot create backup attachment.");
        descriptor = context.getContentResolver().openFileDescriptor(temporary, "rwt");
        if (descriptor == null) { discard(); throw new IllegalStateException("Cannot write backup attachment."); }
        return new ParcelFileDescriptor.AutoCloseOutputStream(descriptor);
    }
    @Override public void sync() throws Exception { descriptor.getFileDescriptor().sync(); }
    @Override public InputStream readTemporary() throws Exception { return read(temporary); }
    @Override public void publish() throws Exception {
        if (find(folder, key) != null) throw new IllegalStateException("Backup attachment appeared during copying.");
        Uri published = DocumentsContract.renameDocument(context.getContentResolver(), temporary, key);
        if (published == null) throw new IllegalStateException("Cannot publish backup attachment.");
        temporary = null;
        if (!published.equals(find(folder, key))) throw new IllegalStateException("Backup provider changed the attachment name.");
    }
    @Override public void discard() throws Exception {
        if (temporary != null && !DocumentsContract.deleteDocument(context.getContentResolver(), temporary)) {
            throw new IllegalStateException("Cannot remove unfinished backup attachment.");
        }
        temporary = null;
    }
}
