package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;

/** Mechanical SQLite and archive adapter for an already validated global-ID page. */
final class FolioleCompanionSyncIdentityPackBuilder {
    private FolioleCompanionSyncIdentityPackBuilder() {}

    static byte[] build(Context context, String snapshotPath, JSONObject page) throws Exception {
        FolioleCompanionSyncPackProviderDefinitions definitions =
            FolioleCompanionSyncPackProviderDefinitions.load(context);
        File file = File.createTempFile("foliole-identity-pack-", ".db", context.getCacheDir());
        SQLiteDatabase pack = SQLiteDatabase.openOrCreateDatabase(file, null);
        try {
            String packId = UUID.randomUUID().toString();
            JSONArray dependencies = fill(pack, definitions, snapshotPath, page);
            JSONArray tables = FolioleCompanionSyncPackProvider
                .tableManifest(pack, definitions.tableNames()).getJSONArray("tables");
            JSONObject inner = new JSONObject().put("contract", "global-id-v1")
                .put("pack_id", packId).put("identity_page", page)
                .put("dependencies", dependencies).put("tables", tables);
            if (isFactPage(page)) {
                try (Cursor tail = pack.rawQuery("SELECT value FROM pack_manifest WHERE key = 'fact_tail'", null)) {
                    tail.moveToFirst();
                    inner.put("fact_tail", new JSONObject(tail.getString(0)));
                }
                JSONObject chunk = FolioleCompanionIdentityFactChunkWriter.metadata(pack);
                if (chunk != null) inner.put("fact_chunk", chunk);
            }
            pack.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', ?)",
                new Object[] { inner.toString() });
            pack.close();
            if (file.length() > 4L * 1024 * 1024) {
                throw new IllegalArgumentException("sync_identity_pack_page_over_budget");
            }
            byte[] database = FolioleCompanionSyncPackProvider.readAll(file);
            byte[] compressed = FolioleCompanionSyncPackProvider.deflate(database);
            JSONObject outer = new JSONObject(inner.toString())
                .put("format", definitions.format()).put("format_version", 21)
                .put("from_peer_id", page.getString("source_peer_id"))
                .put("to_peer_id", page.getString("target_peer_id"))
                .put("schema_version", definitions.schemaVersion())
                .put("compression", "zlib").put("database_file", definitions.databaseEntry())
                .put("database_uncompressed_sha256", sha(database))
                .put("database_compressed_sha256", sha(compressed))
                .put("created_at", Instant.now().toString());
            byte[] archive = FolioleCompanionSyncPackProvider.zip(
                outer, definitions.databaseEntry(), compressed);
            if (archive.length > FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES) {
                throw new IllegalArgumentException("sync_identity_pack_page_over_budget");
            }
            return archive;
        } finally {
            if (pack.isOpen()) pack.close();
            if (!file.delete()) file.deleteOnExit();
        }
    }

    private static JSONArray fill(SQLiteDatabase pack,
            FolioleCompanionSyncPackProviderDefinitions definitions,
            String snapshotPath, JSONObject page) throws Exception {
        pack.execSQL("ATTACH DATABASE ? AS source", new Object[] { snapshotPath });
        try {
            pack.execSQL("BEGIN");
            JSONArray schema = definitions.packSchema();
            for (int index = 0; index < schema.length(); index++) pack.execSQL(schema.getString(index));
            pack.execSQL("ALTER TABLE sync_object_state ADD COLUMN current_version_id TEXT");
            pack.execSQL("CREATE TEMP TABLE selected_identity_objects " +
                "(object_type TEXT NOT NULL, object_id TEXT NOT NULL, PRIMARY KEY(object_type, object_id))");
            JSONArray objects = page.getJSONArray("objects");
            for (int index = 0; index < objects.length(); index++) {
                JSONObject object = objects.getJSONObject(index);
                pack.execSQL("INSERT INTO selected_identity_objects VALUES (?, ?)",
                    new Object[] { object.getString("object_type"), object.getString("object_id") });
            }
            if (isFactPage(page)) {
                copyFacts(pack, definitions, page.getJSONObject("facts"));
            } else {
                boolean thinPrelude = page.has("facts");
                try (Cursor thin = pack.rawQuery(definitions.identityThinPreludeSql(), null)) {
                    thinPrelude = thinPrelude || thin.moveToFirst() && thin.getInt(0) == 1;
                }
                JSONArray copies = definitions.copyStatements();
                for (int index = 0; index < copies.length(); index++) {
                    if (index == definitions.stateCopyIndex()) {
                        pack.execSQL(definitions.identityStateCopySql());
                    } else if (index == definitions.stateCopyIndex() + 1) {
                        pack.execSQL(definitions.identityPreludeCopySql());
                        pack.execSQL(definitions.identityHeadCopySql());
                    } else if (thinPrelude && index == definitions.stateCopyIndex() + 4) {
                        pack.execSQL(definitions.identityFactHeadCopySql());
                    } else if (index == definitions.reviewCopyIndex()) {
                        if (thinPrelude) continue;
                        pack.execSQL(definitions.identityReviewCopySql());
                    } else {
                        if (index == definitions.payloadCopyIndex()) {
                            FolioleCompanionSyncPackPayloadWriter.copy(pack, definitions.payloadPlans());
                        }
                        pack.execSQL(copies.getString(index));
                    }
                }
            }
            try (Cursor missing = pack.rawQuery(definitions.identityMissingOriginalHeadSql(), null)) {
                if (missing.moveToFirst()) throw new IllegalArgumentException("sync_pack_fact_body_unavailable:" + missing.getString(0));
            }
            JSONArray dependencies = dependencies(pack, objects);
            pack.execSQL("COMMIT");
            return dependencies;
        } catch (Exception failure) {
            if (pack.inTransaction()) pack.execSQL("ROLLBACK");
            throw failure;
        } finally { pack.execSQL("DETACH DATABASE source"); }
    }

    private static boolean isFactPage(JSONObject page) throws Exception {
        return page.has("facts") && !"head".equals(page.getJSONObject("facts").getString("section"));
    }

    private static void copyFacts(SQLiteDatabase pack,
            FolioleCompanionSyncPackProviderDefinitions definitions, JSONObject facts) throws Exception {
        pack.execSQL("CREATE TEMP TABLE selected_identity_fact (after_key TEXT, page_limit INTEGER, fact_digest TEXT, chunk_offset INTEGER DEFAULT 0)");
        pack.execSQL("INSERT INTO selected_identity_fact (after_key, page_limit, fact_digest) VALUES (?, ?, ?)", new Object[] {
            facts.isNull("after") ? null : facts.getString("after"), facts.getInt("limit"), facts.getString("digest") });
        try (Cursor valid = pack.rawQuery(definitions.identityFactValidateSql(), null)) {
            if (!valid.moveToFirst() || valid.getInt(0) != 1) {
                throw new IllegalArgumentException("sync_identity_fact_source_mismatch");
            }
        }
        pack.execSQL(definitions.identityStateCopySql());
        pack.execSQL(definitions.identityHeadCopySql());
        JSONArray plans = definitions.identityFactPlans();
        for (int index = 0; index < plans.length(); index++) {
            JSONObject plan = plans.getJSONObject(index);
            if (!plan.getString("section").equals(facts.getString("section"))) continue;
            if (FolioleCompanionIdentityFactChunkWriter.copy(pack, facts, plan)) return;
            try (Cursor size = pack.rawQuery(plan.getString("preflightSql"), null)) {
                if (!size.moveToFirst() || size.getLong(0) > 2L * 1024 * 1024) {
                    throw new IllegalArgumentException("sync_identity_fact_row_over_budget");
                }
            }
            pack.execSQL(plan.getString("copySql"));
            try (Cursor tail = pack.rawQuery(plan.getString("tailSql"), null)) {
                tail.moveToFirst();
                FolioleCompanionIdentityFactChunkWriter.saveTail(pack, new JSONObject().put("nextAfter",
                    tail.isNull(0) ? JSONObject.NULL : tail.getString(0)));
            }
            return;
        }
        throw new IllegalArgumentException("sync_identity_fact_request_invalid");
    }

    private static JSONArray dependencies(SQLiteDatabase pack, JSONArray objects) throws Exception {
        JSONArray result = new JSONArray();
        try (Cursor rows = pack.rawQuery(
            "SELECT state.object_type, state.object_id, indexed.fingerprint " +
            "FROM sync_object_state state LEFT JOIN selected_identity_objects selected " +
            "ON selected.object_type = state.object_type AND selected.object_id = state.object_id " +
            "LEFT JOIN source.sync_identity_index_rows indexed " +
            "ON indexed.object_type = state.object_type AND indexed.object_id = state.object_id " +
            "WHERE selected.object_id IS NULL ORDER BY state.object_id", null)) {
            while (rows.moveToNext()) {
                if (!"node".equals(rows.getString(0)) || rows.isNull(2) || result.length() >= 128) {
                    throw new IllegalArgumentException("sync_identity_pack_page_over_budget");
                }
                result.put(new JSONObject().put("object_type", "node")
                    .put("object_id", rows.getString(1)).put("fingerprint", rows.getString(2)));
            }
        }
        try (Cursor count = pack.rawQuery("SELECT COUNT(*) FROM sync_object_state", null)) {
            if (!count.moveToFirst() || count.getInt(0) != objects.length() + result.length()) {
                throw new IllegalArgumentException("sync_identity_pack_state_scope_mismatch");
            }
        }
        return result;
    }

    private static String sha(byte[] bytes) throws Exception {
        StringBuilder result = new StringBuilder("sha256:");
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) {
            result.append(String.format("%02x", value));
        }
        return result.toString();
    }
}
