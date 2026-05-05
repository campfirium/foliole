package com.foliole.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;

final class FolioleCompanionSyncContentHash {

    private FolioleCompanionSyncContentHash() {}

    static String hash(JSONObject payload) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(stableJson(payload).getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();
        for (byte value : digest) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private static String stableJson(Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) {
            return "null";
        }
        if (value instanceof JSONObject) {
            return stableObject((JSONObject) value);
        }
        if (value instanceof JSONArray) {
            return stableArray((JSONArray) value);
        }
        if (value instanceof String) {
            return JSONObject.quote((String) value);
        }
        if (value instanceof Number || value instanceof Boolean) {
            return value.toString();
        }
        return JSONObject.quote(String.valueOf(value));
    }

    private static String stableObject(JSONObject object) throws Exception {
        ArrayList<String> keys = new ArrayList<>();
        Iterator<String> iterator = object.keys();
        while (iterator.hasNext()) {
            keys.add(iterator.next());
        }
        Collections.sort(keys);
        ArrayList<String> entries = new ArrayList<>();
        for (String key : keys) {
            entries.add(JSONObject.quote(key) + ":" + stableJson(object.get(key)));
        }
        return "{" + String.join(",", entries) + "}";
    }

    private static String stableArray(JSONArray array) throws Exception {
        ArrayList<String> entries = new ArrayList<>();
        for (int index = 0; index < array.length(); index += 1) {
            entries.add(stableJson(array.get(index)));
        }
        return "[" + String.join(",", entries) + "]";
    }
}
