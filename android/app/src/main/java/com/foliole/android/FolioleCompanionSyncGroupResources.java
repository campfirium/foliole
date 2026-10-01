package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.io.File;
import java.io.RandomAccessFile;

final class FolioleCompanionSyncGroupResources {
    private static final int RANGE_BYTES = 1024 * 1024;
    private FolioleCompanionSyncGroupResources() {}

    static Resource contentBlob(String snapshotPath, String hash) {
        if (hash == null || !hash.matches("[a-fA-F0-9]{64}")) return null;
        SQLiteDatabase db = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor cursor = db.rawQuery(
            "SELECT cb.mime_type, cbd.data FROM content_blobs cb JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cb.hash = ?",
            new String[] { hash.toLowerCase() })) {
            if (!cursor.moveToFirst()) return null;
            return new Resource(cursor.isNull(0) ? "application/octet-stream" : cursor.getString(0), cursor.getBlob(1));
        } finally { db.close(); }
    }

    static AttachmentSource attachmentSource(Context context, String attachmentId,
                                             String contentHash, String storageKey) throws Exception {
        String mimeType = FolioleCompanionCanonicalAttachmentKey.mimeType(storageKey);
        if (mimeType == null || contentHash == null || !contentHash.equals(attachmentId) ||
            !FolioleCompanionCanonicalAttachmentKey.matches(contentHash, mimeType, storageKey)) return null;
        File file = new File(new File(context.getFilesDir(), "attachments"), storageKey);
        if (!file.isFile() || java.nio.file.Files.isSymbolicLink(file.toPath())) return null;
        return new AttachmentSource(file, mimeType);
    }

    static Resource attachmentRange(Context context, String attachmentId,
                                    String contentHash, String storageKey, String offsetText, String lengthText) throws Exception {
        AttachmentSource source = attachmentSource(context, attachmentId, contentHash, storageKey);
        if (source == null) return null;
        if (offsetText == null || lengthText == null || !offsetText.matches("[0-9]+") ||
            !lengthText.matches("[0-9]+")) throw new IllegalArgumentException("invalid_request");
        long offset = Long.parseLong(offsetText);
        int length = Integer.parseInt(lengthText);
        try (RandomAccessFile input = new RandomAccessFile(source.file, "r")) {
            long total = input.length();
            if (offset < 0 || offset % RANGE_BYTES != 0 ||
                (offset >= total && !(offset == 0 && total == 0)) ||
                length < 1 || length > RANGE_BYTES ||
                (length != RANGE_BYTES && length != total - offset)) {
                throw new IllegalArgumentException("invalid_request");
            }
            int size = (int) Math.min(length, total - offset);
            byte[] body = new byte[size];
            input.seek(offset);
            input.readFully(body);
            return new Resource(source.mimeType, body, total);
        }
    }

    static final class AttachmentSource {
        final File file;
        final String mimeType;
        AttachmentSource(File file, String mimeType) { this.file = file; this.mimeType = mimeType; }
    }

    static final class Resource {
        final byte[] body;
        final String mimeType;
        final long totalBytes;
        Resource(String mimeType, byte[] body) { this(mimeType, body, -1); }
        Resource(String mimeType, byte[] body, long totalBytes) {
            this.mimeType = mimeType; this.body = body; this.totalBytes = totalBytes;
        }
    }
}
