package com.foliole.android;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;

/** SAF adapter for the backup Attachments folder; app attachment files are the sources. */
final class FolioleFolderBackupAttachmentTarget implements FolioleFolderBackupAttachmentCopy.Documents {
    private final ContentResolver resolver;
    private final Uri tree, folder;

    /** Copies keys in order; a stop request ends the batch between files, a cancellation also within one. */
    static JSArray copy(Context context, JSONObject profile, List<String> keys, BooleanSupplier stopRequested,
        BooleanSupplier cancelled) throws Exception {
        FolioleFolderBackupAttachmentCopy.Folder folder = open(context, profile);
        JSArray results = new JSArray();
        for (String key : keys) {
            if (stopRequested.getAsBoolean() || cancelled.getAsBoolean()) break;
            try {
                boolean copied;
                try (InputStream input = new FileInputStream(source(context, key))) { copied = folder.copy(key, input, cancelled); }
                results.put(new JSObject().put("storageKey", key).put("copied", copied));
            } catch (InterruptedException stopped) { break; }
            catch (Exception error) {
                String message = error.getMessage();
                results.put(new JSObject().put("storageKey", key).put("errorMessage", message == null ? error.toString() : message));
            }
        }
        return results;
    }

    static void delete(Context context, JSONObject profile, String key, BooleanSupplier cancelled) throws Exception {
        if (!FolioleCompanionCanonicalAttachmentKey.valid(key)) throw new IllegalArgumentException("Invalid attachment name.");
        // A failed deletion, local move, or a later restored source cannot authorize removing its backup.
        for (boolean trash : new boolean[] {false, true}) {
            File directory = FolioleAttachmentMaintenanceFiles.directory(context, trash);
            if (!directory.isDirectory() || !directory.canRead()) throw new IllegalStateException("Cannot read source attachment directory.");
            if (new File(directory, key).exists()) throw new IllegalStateException("Source attachment still exists.");
        }
        open(context, profile).delete(key, cancelled);
    }

    static boolean prepareDirectory(Context context, JSONObject profile, boolean create) throws Exception {
        return new FolioleFolderBackupAttachmentTarget(context, profile, create).folder != null;
    }

    private static FolioleFolderBackupAttachmentCopy.Folder open(Context context, JSONObject profile) throws Exception {
        var target = new FolioleFolderBackupAttachmentTarget(context, profile, false);
        if (target.folder == null) throw new IllegalStateException("Backup attachment folder was removed.");
        return new FolioleFolderBackupAttachmentCopy.Folder(target, profile.getString("id"));
    }

    private static File source(Context context, String key) throws Exception {
        if (!FolioleCompanionCanonicalAttachmentKey.valid(key)) throw new IllegalArgumentException("Invalid attachment name.");
        File source = new File(FolioleAttachmentMaintenanceFiles.directory(context, false), key);
        if (!source.exists()) source = new File(FolioleAttachmentMaintenanceFiles.directory(context, true), key);
        return FolioleAttachmentBlockFiles.checkedSourceFile(source);
    }

    private FolioleFolderBackupAttachmentTarget(Context context, JSONObject profile, boolean create) throws Exception {
        resolver = context.getContentResolver();
        tree = Uri.parse(profile.getString("tree"));
        Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Uri selected = findFolder(root);
        if (selected == null && create) {
            Uri created = DocumentsContract.createDocument(resolver, root, DocumentsContract.Document.MIME_TYPE_DIR, "Attachments");
            selected = findFolder(root);
            if (created == null || selected == null
                || !DocumentsContract.getDocumentId(created).equals(DocumentsContract.getDocumentId(selected))) {
                throw new IllegalStateException("Cannot create attachment backup folder.");
            }
        }
        if (selected != null && !DocumentsContract.Document.MIME_TYPE_DIR.equals(resolver.getType(selected))) {
            throw new IllegalStateException("Invalid backup attachment folder.");
        }
        folder = selected;
    }
    private Uri findFolder(Uri root) throws Exception {
        String found = null;
        for (String[] child : children(root)) if ("Attachments".equals(child[0])) {
            if (found != null) throw new IllegalStateException("Duplicate attachment filenames in backup folder.");
            found = child[1];
        }
        return found == null ? null : uri(found);
    }

    private Uri uri(String documentId) { return DocumentsContract.buildDocumentUriUsingTree(tree, documentId); }
    private List<String[]> children(Uri parent) throws Exception {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(parent));
        List<String[]> result = new ArrayList<>();
        try (Cursor rows = resolver.query(children, new String[] {
            DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_DOCUMENT_ID }, null, null, null)) {
            if (rows == null) throw new IllegalStateException("Cannot read attachment backup folder.");
            while (rows.moveToNext()) result.add(new String[] { rows.getString(0), rows.getString(1) });
        }
        return result;
    }
    @Override public List<String[]> children() throws Exception { return children(folder); }
    @Override public String create(String displayName) throws Exception {
        Uri created = DocumentsContract.createDocument(resolver, folder, "application/octet-stream", displayName);
        if (created == null) throw new IllegalStateException("Cannot create backup attachment.");
        return DocumentsContract.getDocumentId(created);
    }
    @Override public void write(String documentId, FolioleFolderBackupAttachmentCopy.StreamWriter writer) throws Exception {
        ParcelFileDescriptor descriptor = resolver.openFileDescriptor(uri(documentId), "rwt");
        if (descriptor == null) throw new IllegalStateException("Cannot write backup attachment.");
        try (OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(descriptor)) {
            writer.write(output);
            output.flush();
            descriptor.getFileDescriptor().sync();
        }
    }
    @Override public InputStream read(String documentId) throws Exception {
        InputStream input = resolver.openInputStream(uri(documentId));
        if (input == null) throw new IllegalStateException("Cannot read backup attachment.");
        return input;
    }
    @Override public String rename(String documentId, String displayName) throws Exception {
        Uri renamed = DocumentsContract.renameDocument(resolver, uri(documentId), displayName);
        if (renamed == null) throw new IllegalStateException("Cannot publish backup attachment.");
        return DocumentsContract.getDocumentId(renamed);
    }
    @Override public String displayName(String documentId) throws Exception {
        try (Cursor rows = resolver.query(uri(documentId), new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (rows == null || !rows.moveToFirst()) throw new IllegalStateException("Cannot read backup attachment.");
            return rows.getString(0);
        }
    }
    @Override public void delete(String documentId) throws Exception {
        if (!DocumentsContract.deleteDocument(resolver, uri(documentId))) throw new IllegalStateException("Cannot remove backup attachment.");
    }
}
