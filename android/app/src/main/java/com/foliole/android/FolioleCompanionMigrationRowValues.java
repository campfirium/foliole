package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionMigrationRowValues {

    private FolioleCompanionMigrationRowValues() {}

    static int integer(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMigrationRules.rowInt(context, row, key);
    }

    static String nullableString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMigrationRules.rowNullableString(context, row, key);
    }

    static String string(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMigrationRules.rowString(context, row, key);
    }
}
