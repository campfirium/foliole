package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.UUID;

/** Builds one selected database pack after fact or dependency filtering. */
final class FolioleCompanionSyncPackProviderCandidate {
    private FolioleCompanionSyncPackProviderCandidate() {}

    static FolioleCompanionSyncPackProvider.BuildResult build(Context context,
            FolioleCompanionSyncPackProviderDefinitions definitions, String snapshotPath,
            String sourceEpoch, String fromPeerId, String toPeerId, int fromSeq, int toSeq,
            int frontier, String expectedIndex, String versionBits, String parentBits,
            String reviewBits, JSONObject dependencyTransfer, boolean allFactsKnown) throws Exception {
        if (expectedIndex == null && dependencyTransfer == null && !allFactsKnown &&
                FolioleCompanionSyncPackVersionBudget.exceeds(
                    definitions, snapshotPath, fromSeq, toSeq)) return null;
        File packDbFile = File.createTempFile("foliole-provider-", ".db", context.getCacheDir());
        String packId = UUID.randomUUID().toString();
        SQLiteDatabase pack = SQLiteDatabase.openOrCreateDatabase(packDbFile, null);
        try {
            FolioleCompanionSyncPackProvider.createPack(pack, definitions, snapshotPath, fromSeq, toSeq);
            JSONObject holds = FolioleCompanionSyncPackVersionHolds.read(pack, packId, toPeerId);
            if (expectedIndex != null) {
                JSONObject index = FolioleCompanionSyncPackFactIndex.read(pack,
                    fromSeq, toSeq, frontier, sourceEpoch);
                FolioleCompanionSyncPackFactIndex.retainMissing(pack, index,
                    expectedIndex, versionBits, parentBits, reviewBits);
            }
            if (dependencyTransfer != null) {
                JSONArray nodes = dependencyTransfer.getJSONArray("nodeIds");
                for (int i = 0; i < nodes.length(); i++) {
                    pack.execSQL("DELETE FROM node_sync_versions WHERE object_id = ?",
                        new Object[] { nodes.getString(i) });
                }
                pack.execSQL("DELETE FROM node_sync_version_parents WHERE version_id NOT IN " +
                    "(SELECT version_id FROM node_sync_versions)");
                if ("node_review".equals(dependencyTransfer.getString("objectType"))) {
                    pack.execSQL("DELETE FROM review_log WHERE node_id = ?",
                        new Object[] { dependencyTransfer.getString("objectId") });
                }
                pack.execSQL("VACUUM");
            }
            if (allFactsKnown) {
                pack.execSQL("DELETE FROM node_sync_version_parents");
                pack.execSQL("DELETE FROM node_sync_versions");
                pack.execSQL("DELETE FROM review_log");
                pack.execSQL("VACUUM");
            }
            if (packDbFile.length() > 4L * 1024 * 1024) return null;
            JSONObject tables = FolioleCompanionSyncPackProvider.tableManifest(pack, definitions.tableNames());
            JSONObject inner = FolioleCompanionSyncPackProvider.innerManifest(packId, sourceEpoch,
                fromSeq, toSeq, frontier, tables.getJSONArray("tables"));
            if (dependencyTransfer != null) inner.put("dependency_transfers",
                new JSONArray().put(dependencyTransfer));
            pack.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', ?)",
                new Object[] { inner.toString() });
            pack.close();
            byte[] database = FolioleCompanionSyncPackProvider.readAll(packDbFile);
            byte[] compressed = FolioleCompanionSyncPackProvider.deflate(database);
            if (compressed.length > FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES) return null;
            JSONObject manifest = FolioleCompanionSyncPackProvider.outerManifest(definitions,
                packId, sourceEpoch, fromPeerId, toPeerId, fromSeq, toSeq, frontier,
                FolioleCompanionSyncPackProvider.tableManifest(packDbFile, definitions.tableNames())
                    .getJSONArray("tables"), database, compressed);
            if (dependencyTransfer != null) manifest.put("dependency_transfers",
                new JSONArray().put(dependencyTransfer));
            byte[] archive = FolioleCompanionSyncPackProvider.zip(
                manifest, definitions.databaseEntry(), compressed);
            return archive.length <= FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES
                ? new FolioleCompanionSyncPackProvider.BuildResult(archive, toSeq, holds) : null;
        } finally {
            if (pack.isOpen()) pack.close();
            if (!packDbFile.delete()) packDbFile.deleteOnExit();
        }
    }
}
