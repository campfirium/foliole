package com.foliole.android;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

final class FolioleCompanionJsonValueParser {

    private FolioleCompanionJsonValueParser() {}

    static Object parse(String rawValue) {
        if (rawValue == null || rawValue.trim().isEmpty()) {
            return null;
        }
        try {
            Object parsed = new JSONTokener(rawValue).nextValue();
            return parsed == JSONObject.NULL ? null : parsed;
        } catch (JSONException exception) {
            return null;
        }
    }
}
