package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

final class FolioleCompanionSyncPackContract {
    private final JSONObject definition;

    private FolioleCompanionSyncPackContract(JSONObject definition) {
        this.definition = definition;
    }

    static FolioleCompanionSyncPackContract load(Context context) throws Exception {
        JSONObject definition = FolioleCompanionSyncProtocolDefinitions.load(context)
            .optJSONObject("syncPackEnvelope");
        if (definition == null) {
            throw new IllegalStateException("Companion sync protocol asset is missing syncPackEnvelope.");
        }
        return new FolioleCompanionSyncPackContract(definition);
    }

    static FolioleCompanionSyncPackContract fromDefinition(JSONObject definition) {
        return new FolioleCompanionSyncPackContract(definition);
    }

    String format() throws Exception {
        return requiredString("format");
    }

    int formatVersion() throws Exception {
        return requiredInt("formatVersion");
    }

    String compression() throws Exception {
        return requiredString("compression");
    }

    String databaseEntry() throws Exception {
        return requiredString("databaseEntry");
    }

    int minimumSchemaVersion() throws Exception {
        return requiredInt("minimumSchemaVersion");
    }

    int maximumSchemaVersion() throws Exception {
        return requiredInt("maximumSchemaVersion");
    }

    Set<String> manifestTableNames() throws Exception {
        return stringSet(definition.getJSONArray("manifestTableNames"));
    }

    Map<String, Set<String>> sqliteTableRequirements() throws Exception {
        JSONObject requirements = definition.getJSONObject("sqliteTableRequirements");
        Map<String, Set<String>> result = new LinkedHashMap<>();
        java.util.Iterator<String> keys = requirements.keys();
        while (keys.hasNext()) {
            String table = keys.next();
            result.put(table, stringSet(requirements.getJSONArray(table)));
        }
        return result;
    }

    private String requiredString(String key) throws Exception {
        Object value = definition.get(key);
        if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
            throw new IllegalStateException("Invalid sync pack contract string: " + key);
        }
        return ((String) value).trim();
    }

    private int requiredInt(String key) throws Exception {
        Object value = definition.get(key);
        if (!(value instanceof Number)) {
            throw new IllegalStateException("Invalid sync pack contract integer: " + key);
        }
        double number = ((Number) value).doubleValue();
        int integer = ((Number) value).intValue();
        if (number != integer) {
            throw new IllegalStateException("Invalid sync pack contract integer: " + key);
        }
        return integer;
    }

    private static Set<String> stringSet(JSONArray values) throws Exception {
        Set<String> result = new LinkedHashSet<>();
        for (int index = 0; index < values.length(); index += 1) {
            Object value = values.get(index);
            if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
                throw new IllegalStateException("Invalid sync pack contract string list.");
            }
            if (!result.add(((String) value).trim())) {
                throw new IllegalStateException("Duplicate sync pack contract string.");
            }
        }
        return result;
    }
}
