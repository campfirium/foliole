package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.UUID;

final class FolioleCompanionSyncPackDependencyArchive {
    private FolioleCompanionSyncPackDependencyArchive() {}

    static byte[] build(Context context, JSONObject page, String fromPeer, String toPeer) throws Exception {
        FolioleCompanionSyncPackProviderDefinitions definitions =
            FolioleCompanionSyncPackProviderDefinitions.load(context);
        String packId = UUID.randomUUID().toString();
        File file = File.createTempFile("foliole-dependency-page-", ".db", context.getCacheDir());
        SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(file, null);
        try {
            db.beginTransaction();
            try {
                JSONArray schema = definitions.packSchema();
                for (int i = 0; i < schema.length(); i++) db.execSQL(schema.getString(i));
                db.execSQL("CREATE TABLE sync_pack_dependency_page_rows " +
                    "(row_index INTEGER PRIMARY KEY, row_json TEXT NOT NULL)");
                JSONArray rows = page.getJSONArray("rows");
                int after = page.getInt("afterRow");
                for (int i = 0; i < rows.length(); i++) {
                    db.execSQL("INSERT INTO sync_pack_dependency_page_rows VALUES (?, ?)",
                        new Object[] { after + i, rows.getJSONObject(i).toString().replace("\\/", "/") });
                }
                JSONObject transfer = page.getJSONObject("transfer");
                JSONObject header = new JSONObject().put("transfer", transfer)
                    .put("afterRow", after).put("beforeDigest", page.getString("beforeDigest"))
                    .put("afterDigest", page.getString("afterDigest"))
                    .put("rowCount", rows.length());
                JSONArray tables = FolioleCompanionSyncPackProvider.tableManifest(db,
                    definitions.tableNames()).getJSONArray("tables");
                JSONObject inner = FolioleCompanionSyncPackProvider.innerManifest(packId,
                    transfer.getString("sourceEpoch"), transfer.getInt("fromStateSeq"),
                    transfer.getInt("fromStateSeq"), transfer.getInt("frontierStateSeq"), tables);
                inner.put("dependency_page", header);
                db.execSQL("INSERT INTO pack_manifest (key,value) VALUES ('manifest_json', ?)",
                    new Object[] { inner.toString() });
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
            db.close();
            if (file.length() > 4L * 1024 * 1024) {
                throw new IllegalArgumentException("sync_pack_dependency_page_over_budget");
            }
            byte[] database = FolioleCompanionSyncPackProvider.readAll(file);
            byte[] compressed = FolioleCompanionSyncPackProvider.deflate(database);
            JSONObject transfer = page.getJSONObject("transfer");
            JSONObject manifest = FolioleCompanionSyncPackProvider.outerManifest(definitions,
                packId, transfer.getString("sourceEpoch"), fromPeer, toPeer,
                transfer.getInt("fromStateSeq"), transfer.getInt("fromStateSeq"),
                transfer.getInt("frontierStateSeq"),
                FolioleCompanionSyncPackProvider.tableManifest(file, definitions.tableNames())
                    .getJSONArray("tables"), database, compressed);
            manifest.put("dependency_page", new JSONObject().put("transfer", transfer)
                .put("afterRow", page.getInt("afterRow"))
                .put("beforeDigest", page.getString("beforeDigest"))
                .put("afterDigest", page.getString("afterDigest"))
                .put("rowCount", page.getJSONArray("rows").length()));
            byte[] archive = FolioleCompanionSyncPackProvider.zip(manifest,
                definitions.databaseEntry(), compressed);
            if (archive.length > FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES) {
                throw new IllegalArgumentException("sync_pack_dependency_page_over_budget");
            }
            return archive;
        } finally {
            if (db.isOpen()) db.close();
            if (!file.delete()) file.deleteOnExit();
        }
    }
}
