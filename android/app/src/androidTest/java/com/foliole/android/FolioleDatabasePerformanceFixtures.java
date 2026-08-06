package com.foliole.android;

import android.database.sqlite.SQLiteDatabase;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.channels.FileChannel;

final class FolioleDatabasePerformanceFixtures {
    private FolioleDatabasePerformanceFixtures() { }

    static File createPack(File cacheDirectory, String name, int rows, int bytesPerRow) {
        File file = new File(cacheDirectory, name);
        SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null);
        database.execSQL("CREATE TABLE pack_blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL)");
        seedRows(database, rows, bytesPerRow);
        database.close();
        return file;
    }

    static void seedRows(SQLiteDatabase database, int rows, int bytesPerRow) {
        database.beginTransaction();
        try {
            for (int index = 0; index < rows; index += 1) {
                if (bytesPerRow == 0) {
                    database.execSQL("INSERT INTO nodes VALUES (?, ?)", new Object[] { "node-" + index, "Node " + index });
                } else {
                    database.execSQL("INSERT INTO pack_blobs VALUES (?, ?)", new Object[] { "blob-" + index, new byte[bytesPerRow] });
                }
            }
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
    }

    static void createAttachmentFiles(File directory) throws Exception {
        int bytes = (int) ((32.6 * 1024 * 1024) / 21);
        for (int index = 0; index < 21; index += 1) {
            try (FileOutputStream output = new FileOutputStream(new File(directory, "attachment-" + index))) {
                output.write(new byte[bytes]);
            }
        }
    }

    static void copyFiles(File source, File target) throws Exception {
        for (File file : source.listFiles()) {
            try (FileChannel input = new java.io.FileInputStream(file).getChannel();
                 FileChannel output = new FileOutputStream(new File(target, file.getName())).getChannel()) {
                input.transferTo(0, input.size(), output);
            }
        }
    }

    static void deleteRecursively(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        if (!file.delete()) throw new IllegalStateException("Could not delete " + file);
    }
}
