package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

final class FolioleCompanionSyncProtocolDefinitions {
    private static final String PROTOCOL_ASSET_PATH = "companion-sync-protocol-definitions.json";

    private FolioleCompanionSyncProtocolDefinitions() {}

    static JSONObject load(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, PROTOCOL_ASSET_PATH));
    }

    static String syncObjectType(Context context, String key) throws Exception {
        String objectType = stringValue(context, "syncObjectTypes", key);
        if (objectType.isEmpty()) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing sync object type: " + key);
        }
        return objectType;
    }

    static String resourceStatus(Context context, String key) throws Exception {
        return stringValue(context, "resourceStatuses", key);
    }

    static Set<String> resourceStatusSet(Context context, String key) throws Exception {
        return stringSet(context, "resourceStatuses", key);
    }

    static JSONObject syncDiagnosticVerdict(Context context, String key) throws Exception {
        JSONObject verdicts = section(context, "syncDiagnostics").optJSONObject("verdicts");
        if (verdicts == null) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing sync diagnostic verdicts.");
        }
        JSONObject verdict = verdicts.optJSONObject(key);
        if (verdict == null) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing sync diagnostic verdict: " + key);
        }
        return verdict;
    }

    static String syncDiagnosticConnectionKey(Context context, String key) throws Exception {
        return syncDiagnosticString(context, "connectionKeys", key);
    }

    static String syncDiagnosticIdentityKey(Context context, String key) throws Exception {
        return syncDiagnosticString(context, "identityKeys", key);
    }

    static String syncDiagnosticOutputKey(Context context, String key) throws Exception {
        return syncDiagnosticString(context, "outputKeys", key);
    }

    static String syncDiagnosticStateKey(Context context, String key) throws Exception {
        return syncDiagnosticString(context, "stateKeys", key);
    }

    static String syncDiagnosticVerdictEvidenceKey(Context context, String key) throws Exception {
        return syncDiagnosticString(context, "verdictEvidenceKeys", key);
    }

    static String syncDiagnosticVerdictKey(Context context, String key) throws Exception {
        return syncDiagnosticString(context, "verdictKeys", key);
    }

    static String syncPluginAcksRequestKey(Context context) throws Exception {
        return syncPluginRequestKey(context, "acks");
    }

    static String syncPluginCursorRequestKey(Context context) throws Exception {
        return syncPluginRequestKey(context, "cursor");
    }

    static String syncPluginLimitRequestKey(Context context) throws Exception {
        return syncPluginRequestKey(context, "limit");
    }

    static String syncPluginObjectIdsRequestKey(Context context) throws Exception {
        return syncPluginRequestKey(context, "objectIds");
    }

    static String syncPluginObjectTypesRequestKey(Context context) throws Exception {
        return syncPluginRequestKey(context, "objectTypes");
    }

    static String syncCursorChangeIdPayloadKey(Context context) throws Exception {
        return syncCursorPayloadKey(context, "changeId");
    }

    static String syncCursorCreatedAtPayloadKey(Context context) throws Exception {
        return syncCursorPayloadKey(context, "createdAt");
    }

    static String syncCursorCursorPayloadKey(Context context) throws Exception {
        return syncCursorPayloadKey(context, "cursor");
    }

    private static String syncCursorPayloadKey(Context context, String key) throws Exception {
        return stringValue(context, "syncCursorPayloadKeys", key);
    }

    private static String syncPluginRequestKey(Context context, String key) throws Exception {
        return stringValue(context, "syncPluginRequestKeys", key);
    }

    static Set<String> stringSet(Context context, String sectionName, String key) throws Exception {
        return stringSet(section(context, sectionName), key);
    }

    static Set<String> stringSet(JSONObject section, String key) throws Exception {
        JSONArray values = section.getJSONArray(key);
        Set<String> result = new HashSet<>();
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.getString(index).trim();
            if (!value.isEmpty()) result.add(value);
        }
        return result;
    }

    static String stringValue(Context context, String sectionName, String key) throws Exception {
        String value = section(context, sectionName).optString(key, "").trim();
        if (value.isEmpty()) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing value: " + sectionName + "." + key);
        }
        return value;
    }

    static JSONObject objectValue(Context context, String sectionName, String key) throws Exception {
        JSONObject value = section(context, sectionName).optJSONObject(key);
        if (value == null) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing object: " + sectionName + "." + key);
        }
        return value;
    }

    private static String syncDiagnosticString(Context context, String objectName, String key) throws Exception {
        return objectValue(context, "syncDiagnostics", objectName).getString(key);
    }

    private static JSONObject section(Context context, String sectionName) throws Exception {
        JSONObject section = load(context).optJSONObject(sectionName);
        if (section == null) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing section: " + sectionName);
        }
        return section;
    }
}
