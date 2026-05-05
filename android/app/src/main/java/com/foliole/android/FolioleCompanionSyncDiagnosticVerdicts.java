package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticVerdicts {
    private FolioleCompanionSyncDiagnosticVerdicts() {}

    static JSArray build(
        Context context,
        JSObject connection,
        JSObject storage,
        JSObject syncState,
        JSObject content,
        JSArray events
    ) throws Exception {
        JSONObject connectionKeys = diagnosticObject(context, "connectionKeys");
        JSONObject stateKeys = diagnosticObject(context, "stateKeys");
        JSONObject metricKeys = metricKeys(context);
        JSArray verdicts = new JSArray();
        if (connection.optString(connectionKeys.getString("endpointUrl"), null) == null) {
            add(context, verdicts, "endpointMissing", connection);
        }
        if (!syncState.has(stateKeys.getString("packCursor")) || syncState.isNull(stateKeys.getString("packCursor"))) {
            add(context, verdicts, "packCursorMissing", syncState);
        }
        if (storage.optLong(metricKeys.getString("activeNodeCount"), 0) == 0 && hasCompletedEvent(context, events)) {
            add(context, verdicts, "noNodesAfterCompletedSync", storage);
        }
        if (content.optLong(metricKeys.getString("missingContentBlobCount"), 0) > 0) {
            add(context, verdicts, "missingContentBlobs", content);
        }
        if (content.optLong(metricKeys.getString("missingAttachmentResourceCount"), 0) > 0) {
            add(context, verdicts, "missingAttachmentResources", content);
        }
        JSONObject failed = recentFailedEvent(context, events);
        if (failed != null) {
            JSONObject evidenceKeys = diagnosticObject(context, "verdictEvidenceKeys");
            JSObject evidence = new JSObject();
            evidence.put(evidenceKeys.getString("message"), failed.optString(evidenceKeys.getString("message")));
            evidence.put(evidenceKeys.getString("occurredAt"), failed.optString(evidenceKeys.getString("occurredAt")));
            add(context, verdicts, "recentSyncFailed", evidence);
        }
        if (syncState.optLong(metricKeys.getString("localDirtyCount"), 0) > 0) {
            add(context, verdicts, "hasLocalDirtyState", syncState);
        }
        if (syncState.optLong(metricKeys.getString("pendingAckCount"), 0) > 0) {
            add(context, verdicts, "hasPendingPushAck", syncState);
        }
        if (syncState.optLong(metricKeys.getString("pushIssueCount"), 0) > 0) {
            add(context, verdicts, "hasPushIssues", syncState);
        }
        if (verdicts.length() == 0) {
            add(context, verdicts, "ready", storage);
        }
        return verdicts;
    }

    private static boolean hasCompletedEvent(Context context, JSArray events) throws Exception {
        String completedStatus = syncEventCompletedStatus(context);
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (
                event != null &&
                completedStatus.equals(event.optString(syncEventRecordKey(context, "status"))) &&
                fullSyncCompletedMessage(context).equals(event.optString(syncEventRecordKey(context, "message")))
            ) {
                return true;
            }
        }
        return false;
    }

    private static JSONObject recentFailedEvent(Context context, JSArray events) throws Exception {
        String completedStatus = syncEventCompletedStatus(context);
        String failedStatus = syncEventFallbackStatus(context);
        String skippedStatus = syncEventSkippedStatus(context);
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event == null) continue;
            String status = event.optString(syncEventRecordKey(context, "status"));
            if (failedStatus.equals(status)) return event;
            if (completedStatus.equals(status) || skippedStatus.equals(status)) return null;
        }
        return null;
    }

    private static String syncEventCompletedStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "completedStatus");
    }

    private static String syncEventFallbackStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "fallbackStatus");
    }

    private static String fullSyncCompletedMessage(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "fullSyncCompletedMessage");
    }

    private static String syncEventSkippedStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "skippedStatus");
    }

    private static void add(Context context, JSArray verdicts, String key, JSObject evidence) throws Exception {
        JSONObject definition = FolioleCompanionSyncProtocolDefinitions.syncDiagnosticVerdict(context, key);
        JSONObject verdictKeys = diagnosticObject(context, "verdictKeys");
        JSObject verdict = new JSObject();
        verdict.put(verdictKeys.getString("code"), definition.getString(verdictKeys.getString("code")));
        verdict.put(verdictKeys.getString("severity"), definition.getString(verdictKeys.getString("severity")));
        verdict.put(verdictKeys.getString("message"), definition.getString(verdictKeys.getString("message")));
        verdict.put(verdictKeys.getString("evidence"), evidence);
        verdicts.put(verdict);
    }

    private static JSONObject diagnosticObject(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.objectValue(context, "syncDiagnostics", key);
    }

    private static String syncEventRecordKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEventRecordKeys", key);
    }

    private static JSONObject metricKeys(Context context) throws Exception {
        return FolioleCompanionSyncDiagnosticQueryRules.object(context, "verdictMetricKeys");
    }
}
