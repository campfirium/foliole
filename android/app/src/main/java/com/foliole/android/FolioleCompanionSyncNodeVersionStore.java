package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncNodeVersionStore {

    private FolioleCompanionSyncNodeVersionStore() {}

    static JSObject loadNodeVersions(Context context, SQLiteDatabase database, JSONObject cursor, int limit, String deviceId) throws Exception {
        JSObject result = FolioleCompanionGeneratedArrayQueryRunner.load(
            context,
            database,
            FolioleCompanionSyncStreamQueryRules.nodeVersionsQueryName(context),
            FolioleCompanionSyncStreamQueryRules.cursorArgs(context, "nodeVersions", cursor, deviceId, limit)
        );
        appendAncestorVersionIds(context, database, result.getJSONArray(FolioleCompanionSyncStreamQueryRules.nodeVersionsResultKey(context)));
        return result;
    }

    private static void appendAncestorVersionIds(Context context, SQLiteDatabase database, JSONArray nodes) throws Exception {
        for (int index = 0; index < nodes.length(); index += 1) {
            JSONObject node = nodes.getJSONObject(index);
            node.put(
                FolioleCompanionSyncStreamQueryRules.nodeVersionAncestorIdsKey(context),
                listAncestorVersionIds(context, database, node.getString(FolioleCompanionSyncStreamQueryRules.nodeVersionIdKey(context)))
            );
        }
    }

    private static JSONArray listAncestorVersionIds(Context context, SQLiteDatabase database, String versionId) throws Exception {
        JSONArray ancestors = new JSONArray();
        String cursorVersionId = versionId;
        for (int depth = 0; depth < FolioleCompanionSyncStreamQueryRules.nodeVersionAncestorDepthLimit(context); depth += 1) {
            String parentVersionId = FolioleCompanionNamedQueryStore.loadString(
                context,
                database,
                FolioleCompanionSyncStreamQueryRules.nodeVersionParentQueryName(context),
                new String[] { cursorVersionId }
            );
            if (parentVersionId == null || parentVersionId.trim().isEmpty()) {
                break;
            }
            ancestors.put(parentVersionId);
            cursorVersionId = parentVersionId;
        }
        return ancestors;
    }
}
