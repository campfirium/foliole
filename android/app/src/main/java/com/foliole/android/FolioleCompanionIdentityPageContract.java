package com.foliole.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.security.MessageDigest;
import java.util.Arrays;

/** Mechanical canonical JSON binding for the shared identity page contract. */
final class FolioleCompanionIdentityPageContract {
    static void validate(JSONObject page, JSONObject manifest) throws Exception {
        if (!"global-id-v1".equals(page.getString("contract"))) throw invalid();
        JSONArray material = new JSONArray();
        for (String key : new String[] { "group_id", "source_peer_id", "target_peer_id", "source_view_id" }) {
            material.put(page.getString(key));
        }
        if (!(page.get("page_index") instanceof Number)) throw invalid();
        double index = page.getDouble("page_index");
        if (index < 0 || index > 9007199254740991L || index != Math.floor(index)) throw invalid();
        material.put((long) index).put(page.get("previous_page_id"));
        if ((index == 0) != page.isNull("previous_page_id") ||
            !page.isNull("previous_page_id") && !page.getString("previous_page_id").matches("[a-f0-9]{64}")) throw invalid();
        JSONArray objects = page.getJSONArray("objects");
        int expectedFields = 9 + (page.has("restore_id") ? 2 : 0) + (page.has("facts") ? 1 : 0);
        if (page.length() != expectedFields || objects.length() > 128) throw invalid();
        JSONArray keys = new JSONArray();
        for (int offset = 0; offset < objects.length(); offset++) {
            JSONObject object = objects.getJSONObject(offset);
            if (object.length() != 3) throw invalid();
            keys.put(new JSONArray().put(object.getString("object_type"))
                .put(object.getString("object_id")).put(object.getString("fingerprint")));
        }
        material.put(keys);
        if (page.has("restore_id")) {
            material.put(page.getString("restore_id")).put(page.getString("restore_set_id"));
        } else if (page.has("restore_set_id")) throw invalid();
        String json = canonical(material);
        if (page.has("facts")) {
            JSONObject facts = page.getJSONObject("facts");
            if (objects.length() != 1 || !"node".equals(objects.getJSONObject(0).getString("object_type"))) throw invalid();
            json = json.substring(0, json.length() - 1) + "," + facts(facts) + "]";
        }
        StringBuilder hash = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(json.getBytes("UTF-8"))) {
            hash.append(String.format("%02x", value));
        }
        if (!hash.toString().equals(page.getString("page_id"))) throw invalid();
        tail(page, manifest);
    }

    private static String facts(JSONObject facts) throws Exception {
        String section = facts.getString("section");
        if (!(facts.get("limit") instanceof Number)) throw invalid();
        double limit = facts.getDouble("limit");
        if (facts.length() != 4 + (facts.has("chunk") ? 1 : 0) || !Arrays.asList("versions", "parents", "reviews", "head").contains(section) ||
            limit < 1 || limit > 64 || limit != Math.floor(limit) ||
            !facts.getString("digest").matches("[a-f0-9]{64}")) throw invalid();
        Object after = facts.get("after");
        requireCursor(after);
        if ("head".equals(section) && (after != JSONObject.NULL || facts.has("chunk"))) throw invalid();
        String json = "{\"section\":" + canonical(section) + ",\"after\":" + canonical(after) +
            ",\"limit\":" + (long) limit + ",\"digest\":" + canonical(facts.getString("digest"));
        if (facts.has("chunk")) json += ",\"chunk\":" + chunk(facts.getJSONObject("chunk"), "offset", 0);
        return json + "}";
    }

    private static void tail(JSONObject page, JSONObject manifest) throws Exception {
        JSONObject facts = page.optJSONObject("facts");
        boolean phase = facts != null && !"head".equals(facts.getString("section"));
        if (phase != manifest.has("fact_tail")) throw invalid();
        if (phase) {
            JSONObject tail = manifest.getJSONObject("fact_tail");
            if (tail.length() != 1 + (tail.has("chunk") ? 1 : 0)) throw invalid();
            requireCursor(tail.get("nextAfter"));
            if (tail.has("chunk")) chunk(tail.getJSONObject("chunk"), "nextOffset", 1);
        }
        JSONObject metadata = manifest.optJSONObject("fact_chunk");
        if (metadata != null) {
            if (!phase) throw invalid();
            chunk(metadata, "offset", 0);
            if (facts.has("chunk") && !same(facts.getJSONObject("chunk"), metadata)) throw invalid();
            if (!facts.has("chunk") && metadata.getLong("offset") != 0) throw invalid();
        } else if (manifest.has("fact_chunk") || facts != null && facts.has("chunk") ||
            phase && manifest.getJSONObject("fact_tail").has("chunk")) throw invalid();
    }

    private static String chunk(JSONObject value, String offsetKey, int minimum) throws Exception {
        String key = value.getString("key");
        if (value.length() != 3 || key.isEmpty() || key.length() > 4096 ||
            !(value.get(offsetKey) instanceof Number) || !(value.get("total") instanceof Number)) throw invalid();
        double offset = value.getDouble(offsetKey), total = value.getDouble("total");
        if (offset < minimum || offset != Math.floor(offset) || total != Math.floor(total) ||
            offset >= total || total > 9007199254740991L) throw invalid();
        return "{\"key\":" + canonical(key) + ",\"" + offsetKey + "\":" + (long) offset +
            ",\"total\":" + (long) total + "}";
    }

    static boolean same(JSONObject left, JSONObject right) throws Exception {
        if (left.length() != right.length()) return false;
        java.util.Iterator<String> keys = left.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!right.has(key)) return false;
            Object a = left.get(key), b = right.get(key);
            if (a instanceof JSONObject && b instanceof JSONObject) {
                if (!same((JSONObject) a, (JSONObject) b)) return false;
            } else if (!canonical(a).equals(canonical(b))) return false;
        }
        return true;
    }

    private static void requireCursor(Object value) {
        if (value != JSONObject.NULL && (!(value instanceof String) ||
            ((String) value).isEmpty() || ((String) value).length() > 4096)) throw invalid();
    }

    private static String canonical(Object value) throws Exception {
        if (value == JSONObject.NULL) return "null";
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder json = new StringBuilder("[");
            for (int index = 0; index < array.length(); index++) {
                if (index > 0) json.append(',');
                json.append(canonical(array.get(index)));
            }
            return json.append(']').toString();
        }
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            java.util.List<String> keys = new java.util.ArrayList<>();
            java.util.Iterator<String> iterator = object.keys();
            while (iterator.hasNext()) keys.add(iterator.next());
            java.util.Collections.sort(keys);
            StringBuilder json = new StringBuilder("{");
            for (String key : keys) {
                if (json.length() > 1) json.append(',');
                json.append(canonical(key)).append(':').append(canonical(object.get(key)));
            }
            return json.append('}').toString();
        }
        if (!(value instanceof String)) return String.valueOf(value);
        return quote((String) value);
    }

    private static String quote(String text) {
        StringBuilder json = new StringBuilder("\"");
        for (int index = 0; index < text.length(); index++) {
            char character = text.charAt(index);
            switch (character) {
                case '"': json.append("\\\""); break;
                case '\\': json.append("\\\\"); break;
                case '\b': json.append("\\b"); break;
                case '\f': json.append("\\f"); break;
                case '\n': json.append("\\n"); break;
                case '\r': json.append("\\r"); break;
                case '\t': json.append("\\t"); break;
                default:
                    boolean lone = Character.isSurrogate(character) && !(Character.isHighSurrogate(character) &&
                        index + 1 < text.length() && Character.isLowSurrogate(text.charAt(index + 1))) &&
                        !(Character.isLowSurrogate(character) && index > 0 && Character.isHighSurrogate(text.charAt(index - 1)));
                    if (character < 32 || lone) json.append(String.format("\\u%04x", (int) character));
                    else json.append(character);
            }
        }
        return json.append('"').toString();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("sync_identity_pack_page_invalid");
    }
}
