package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionJsonAssetCache {
    private static final Map<String, JSONObject> OBJECTS = new HashMap<>();

    private FolioleCompanionJsonAssetCache() {}

    static synchronized JSONObject object(Context context, String assetPath) throws Exception {
        JSONObject cached = OBJECTS.get(assetPath);
        if (cached != null) {
            return cached;
        }
        JSONObject parsed = new JSONObject(FolioleCompanionAssetReader.read(context, assetPath));
        OBJECTS.put(assetPath, parsed);
        return parsed;
    }
}
