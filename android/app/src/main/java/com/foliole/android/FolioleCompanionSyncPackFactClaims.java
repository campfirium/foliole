package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

/** Receiver claims for one paged fact round, kept on disk across dependency pages. */
final class FolioleCompanionSyncPackFactClaims implements AutoCloseable {
    private final File file;
    private final SQLiteDatabase db;

    private FolioleCompanionSyncPackFactClaims(File file, SQLiteDatabase db) {
        this.file = file;
        this.db = db;
    }

    static FolioleCompanionSyncPackFactClaims create(Context context, String peer) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
            .digest(peer.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder("sync-fact-claims-");
        for (byte value : digest) name.append(String.format("%02x", value & 0xff));
        File file = new File(context.getCacheDir(), name + ".db");
        SQLiteDatabase.deleteDatabase(file);
        SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(file, null);
        db.execSQL("CREATE TABLE claims (table_name TEXT NOT NULL, fact_key TEXT NOT NULL, " +
            "PRIMARY KEY (table_name, fact_key))");
        return new FolioleCompanionSyncPackFactClaims(file, db);
    }

    synchronized void accept(JSONObject index, String versions, String parents,
            String reviews) throws Exception {
        FolioleCompanionSyncPackFactIndex.validateBits(index, versions, parents, reviews);
        db.beginTransaction();
        try {
            insert("node_sync_versions", FolioleCompanionSyncPackDependencyRows.held(
                index.getJSONArray("versions"), versions, "version_id"));
            insert("node_sync_version_parents", FolioleCompanionSyncPackDependencyRows.held(
                index.getJSONArray("parents"), parents, null));
            insert("review_log", FolioleCompanionSyncPackDependencyRows.held(
                index.getJSONArray("reviews"), reviews, "op_id"));
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    private void insert(String table, Set<String> keys) {
        for (String key : keys) db.execSQL(
            "INSERT OR IGNORE INTO claims (table_name, fact_key) VALUES (?, ?)",
            new Object[] { table, key });
    }

    synchronized boolean contains(String table, String key) {
        try (Cursor row = db.rawQuery("SELECT 1 FROM claims WHERE table_name = ? " +
                "AND fact_key = ? LIMIT 1", new String[] { table, key })) {
            return row.moveToFirst();
        }
    }

    @Override public synchronized void close() {
        db.close();
        SQLiteDatabase.deleteDatabase(file);
    }
}
