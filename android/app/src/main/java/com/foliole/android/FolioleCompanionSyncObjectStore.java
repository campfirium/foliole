package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionSyncObjectStore {
    private FolioleCompanionSyncObjectStore() {}

    static JSObject loadSyncIndex(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(context, database, "syncIndex");
    }

    static JSObject loadSyncObjects(Context context, SQLiteDatabase database, JSONArray objectIds, JSONArray objectTypes) throws Exception {
        List<String> ids = toStringList(objectIds);
        List<String> types = toStringList(objectTypes);
        if (ids.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("objects", new JSArray());
            return empty;
        }
        return FolioleCompanionNamedQueryStore.loadSyncRowsWithPayloads(
            context,
            database,
            "syncObjects",
            "objects",
            syncObjectQueryReplacements(ids.size(), types.size()),
            syncObjectQueryArgs(ids, types)
        );
    }

    static JSObject loadSyncStateChanges(Context context, SQLiteDatabase database, int cursor, int limit) throws Exception {
        return FolioleCompanionNamedQueryStore.loadSyncRowsWithPayloads(
            context,
            database,
            "syncStateChanges",
            "objects",
            null,
            new String[] { String.valueOf(Math.max(0, cursor)), String.valueOf(normalizeLimit(limit)) }
        );
    }

    private static Map<String, String> syncObjectQueryReplacements(int idCount, int typeCount) {
        Map<String, String> replacements = new HashMap<>();
        replacements.put(":objectIds", placeholders(idCount));
        replacements.put(":objectTypes", typeCount > 0 ? placeholders(typeCount) : "NULL");
        return replacements;
    }

    private static String[] syncObjectQueryArgs(List<String> ids, List<String> types) {
        List<String> args = new ArrayList<>(ids);
        args.add(String.valueOf(types.size()));
        args.addAll(types);
        return args.toArray(new String[0]);
    }

    private static List<String> toStringList(JSONArray values) {
        List<String> strings = new ArrayList<>();
        if (values == null) return strings;
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.optString(index, "").trim();
            if (!value.isEmpty()) strings.add(value);
        }
        return strings;
    }

    private static String placeholders(int count) {
        List<String> placeholders = new ArrayList<>();
        for (int index = 0; index < count; index += 1) placeholders.add("?");
        return String.join(",", placeholders);
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }

}
