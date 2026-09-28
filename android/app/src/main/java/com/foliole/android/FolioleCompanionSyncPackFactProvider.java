package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

import java.io.File;

final class FolioleCompanionSyncPackFactProvider {
    private FolioleCompanionSyncPackFactProvider() {}

    static JSONObject index(Context context, String snapshotPath, int fromSeq,
                            Integer requestedFrontier, String requestedEpoch) throws Exception {
        SQLiteDatabase source = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        int frontier;
        int toSeq;
        String epoch;
        try {
            try (Cursor cursor = source.rawQuery(
                "SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1", null)) {
                if (!cursor.moveToFirst() || cursor.isNull(1)) {
                    throw new IllegalArgumentException("sync_pack_source_epoch_missing");
                }
                frontier = requestedFrontier == null ? cursor.getInt(0) : requestedFrontier;
                epoch = cursor.getString(1);
                if (fromSeq < 0 || frontier < fromSeq || frontier > cursor.getInt(0)) {
                    throw new IllegalArgumentException("sync_pack_frontier_unavailable");
                }
            }
            if (requestedEpoch != null && !requestedEpoch.equals(epoch)) {
                throw new IllegalArgumentException("sync_pack_source_epoch_changed");
            }
            try (Cursor cursor = source.rawQuery(
                "SELECT state_seq FROM sync_object_state WHERE state_seq > ? AND state_seq <= ? " +
                "ORDER BY state_seq LIMIT 1",
                new String[] { String.valueOf(fromSeq), String.valueOf(frontier) })) {
                toSeq = cursor.moveToFirst() ? cursor.getInt(0) : frontier;
            }
        } finally { source.close(); }
        File file = File.createTempFile("foliole-fact-index-", ".db", context.getCacheDir());
        SQLiteDatabase pack = SQLiteDatabase.openOrCreateDatabase(file, null);
        try {
            FolioleCompanionSyncPackProvider.createPack(pack,
                FolioleCompanionSyncPackProviderDefinitions.load(context), snapshotPath, fromSeq, toSeq);
            return FolioleCompanionSyncPackFactIndex.read(pack, fromSeq, toSeq, frontier, epoch);
        } finally {
            pack.close();
            if (!file.delete()) file.deleteOnExit();
        }
    }
}
