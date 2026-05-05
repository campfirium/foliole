package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;

final class FolioleCompanionSyncObjectStore {
    private FolioleCompanionSyncObjectStore() {}

    static JSObject loadSyncIndex(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(context, database, FolioleCompanionSyncObjectQueryRules.syncIndexQueryName(context));
    }

    static JSObject loadSyncObjects(Context context, SQLiteDatabase database, JSONArray objectIds, JSONArray objectTypes) throws Exception {
        List<String> ids = toStringList(objectIds);
        List<String> types = toStringList(objectTypes);
        if (ids.isEmpty()) {
            return FolioleCompanionSyncObjectQueryRules.emptySyncObjects(context);
        }
        return FolioleCompanionSyncPayloadQueryStore.loadRowsWithPayloads(
            context,
            database,
            FolioleCompanionSyncObjectQueryRules.syncObjectsQueryName(context),
            FolioleCompanionSyncObjectQueryRules.syncObjectsResultKey(context),
            FolioleCompanionSyncObjectQueryRules.syncObjectsReplacements(context, ids.size(), types.size()),
            syncObjectQueryArgs(ids, types)
        );
    }

    static JSObject loadSyncStateChanges(Context context, SQLiteDatabase database, int cursor, int limit) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.loadRowsWithPayloads(
            context,
            database,
            FolioleCompanionSyncObjectQueryRules.syncStateChangesQueryName(context),
            FolioleCompanionSyncObjectQueryRules.syncStateChangesResultKey(context),
            null,
            new String[] {
                String.valueOf(FolioleCompanionSyncObjectQueryRules.normalizeCursor(context, cursor)),
                String.valueOf(FolioleCompanionSyncObjectQueryRules.normalizeLimit(context, limit))
            }
        );
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
}
