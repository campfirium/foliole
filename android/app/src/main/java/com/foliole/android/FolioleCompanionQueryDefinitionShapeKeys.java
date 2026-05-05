package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionQueryDefinitionShapeKeys {
    private FolioleCompanionQueryDefinitionShapeKeys() {}

    static String columnKey(Context context, String key) throws Exception {
        return section(context, "column").getString(key);
    }

    static String columnType(Context context, String key) throws Exception {
        return section(context, "columnTypes").getString(key);
    }

    static String queryKey(Context context, String key) throws Exception {
        return section(context, "query").getString(key);
    }

    static String routingKey(Context context, String key) throws Exception {
        return section(context, "routing").getString(key);
    }

    private static JSONObject section(Context context, String key) throws Exception {
        return FolioleCompanionQueryAssetKeys.section(context, "queryShape").getJSONObject(key);
    }
}
