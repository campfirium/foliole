package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

final class FolioleCompanionSyncPackDatabaseValidator {
    private FolioleCompanionSyncPackDatabaseValidator() {}

    static void validate(
        File file,
        FolioleCompanionSyncPackEnvelopeValidator.PreparedEnvelope envelope
    ) throws Exception {
        SQLiteDatabase database = null;
        try {
            database = SQLiteDatabase.openDatabase(file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            requireQuickCheck(database);
            requireTablesAndColumns(database, envelope.contract.sqliteTableRequirements());
            requireRowCounts(database, envelope.rowCounts);
            requireInnerManifest(database, envelope.manifest);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("invalid_sync_pack_sqlite", exception);
        } finally {
            if (database != null) database.close();
        }
    }

    private static void requireQuickCheck(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("PRAGMA quick_check(1)", null)) {
            if (!cursor.moveToFirst() || !"ok".equals(cursor.getString(0)) || cursor.moveToNext()) {
                throw invalid("invalid_sync_pack_quick_check");
            }
        }
    }

    private static void requireTablesAndColumns(
        SQLiteDatabase database,
        Map<String, Set<String>> requirements
    ) {
        for (Map.Entry<String, Set<String>> requirement : requirements.entrySet()) {
            Set<String> actual = loadColumns(database, requirement.getKey());
            if (!actual.containsAll(requirement.getValue())) {
                throw invalid("invalid_sync_pack_table_structure:" + requirement.getKey());
            }
        }
    }

    private static Set<String> loadColumns(SQLiteDatabase database, String table) {
        Set<String> columns = new LinkedHashSet<>();
        try (Cursor cursor = database.rawQuery("PRAGMA table_info(" + quoteIdentifier(table) + ")", null)) {
            while (cursor.moveToNext()) columns.add(cursor.getString(1));
        }
        return columns;
    }

    private static void requireRowCounts(SQLiteDatabase database, Map<String, Integer> expected) {
        for (Map.Entry<String, Integer> table : expected.entrySet()) {
            try (Cursor cursor = database.rawQuery(
                "SELECT COUNT(*) FROM " + quoteIdentifier(table.getKey()),
                null
            )) {
                if (!cursor.moveToFirst() || cursor.getLong(0) != table.getValue()) {
                    throw invalid("invalid_sync_pack_row_count:" + table.getKey());
                }
            }
        }
    }

    private static void requireInnerManifest(SQLiteDatabase database, JSONObject outer) throws Exception {
        String value;
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM pack_manifest WHERE key = ?",
            new String[] { "manifest_json" }
        )) {
            if (!cursor.moveToFirst()) throw invalid("missing_sync_pack_inner_manifest");
            value = cursor.getString(0);
            if (cursor.moveToNext()) throw invalid("duplicate_sync_pack_inner_manifest");
        }
        JSONObject inner = new JSONObject(value);
        if (!outer.getString("pack_id").equals(inner.optString("pack_id")) ||
            outer.getInt("from_state_seq") != inner.optInt("from_state_seq", -1) ||
            outer.getInt("to_state_seq") != inner.optInt("to_state_seq", -1) ||
            !tableCounts(outer.getJSONArray("tables")).equals(tableCounts(inner.getJSONArray("tables")))) {
            throw invalid("sync_pack_inner_manifest_mismatch");
        }
    }

    private static Map<String, Integer> tableCounts(JSONArray tables) throws Exception {
        Map<String, Integer> result = new LinkedHashMap<>();
        for (int index = 0; index < tables.length(); index += 1) {
            JSONObject table = tables.getJSONObject(index);
            if (result.put(table.getString("name"), table.getInt("row_count")) != null) {
                throw invalid("invalid_sync_pack_inner_manifest");
            }
        }
        return result;
    }

    private static String quoteIdentifier(String identifier) {
        if (!identifier.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw invalid("invalid_sync_pack_contract_identifier");
        }
        return "\"" + identifier + "\"";
    }

    private static IllegalArgumentException invalid(String code) {
        return new IllegalArgumentException(code);
    }
}
