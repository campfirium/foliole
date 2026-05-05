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
        JSArray verdicts = new JSArray();
        if (connection.optString(diagnosticConnectionKey(context, "endpointUrl"), null) == null) {
            add(context, verdicts, "endpointMissing", connection);
        }
        if (!syncState.has(diagnosticStateKey(context, "packCursor")) || syncState.isNull(diagnosticStateKey(context, "packCursor"))) {
            add(context, verdicts, "packCursorMissing", syncState);
        }
        if (storage.optLong(verdictMetricKey(context, "activeNodeCount"), 0) == 0 && hasCompletedEvent(context, events)) {
            add(context, verdicts, "noNodesAfterCompletedSync", storage);
        }
        if (content.optLong(verdictMetricKey(context, "missingContentBlobCount"), 0) > 0) {
            add(context, verdicts, "missingContentBlobs", content);
        }
        if (content.optLong(verdictMetricKey(context, "missingAttachmentResourceCount"), 0) > 0) {
            add(context, verdicts, "missingAttachmentResources", content);
        }
        JSONObject failed = recentFailedEvent(context, events);
        if (failed != null) {
            JSObject evidence = new JSObject();
            evidence.put(diagnosticVerdictEvidenceKey(context, "message"), failed.optString(diagnosticVerdictEvidenceKey(context, "message")));
            evidence.put(diagnosticVerdictEvidenceKey(context, "occurredAt"), failed.optString(diagnosticVerdictEvidenceKey(context, "occurredAt")));
            add(context, verdicts, "recentSyncFailed", evidence);
        }
        if (syncState.optLong(verdictMetricKey(context, "localDirtyCount"), 0) > 0) {
            add(context, verdicts, "hasLocalDirtyState", syncState);
        }
        if (syncState.optLong(verdictMetricKey(context, "pendingAckCount"), 0) > 0) {
            add(context, verdicts, "hasPendingPushAck", syncState);
        }
        if (syncState.optLong(verdictMetricKey(context, "pushIssueCount"), 0) > 0) {
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
        JSObject verdict = new JSObject();
        verdict.put(diagnosticVerdictKey(context, "code"), definition.getString(diagnosticVerdictKey(context, "code")));
        verdict.put(diagnosticVerdictKey(context, "severity"), definition.getString(diagnosticVerdictKey(context, "severity")));
        verdict.put(diagnosticVerdictKey(context, "message"), definition.getString(diagnosticVerdictKey(context, "message")));
        verdict.put(diagnosticVerdictKey(context, "evidence"), evidence);
        verdicts.put(verdict);
    }

    private static String diagnosticConnectionKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncDiagnosticConnectionKey(context, key);
    }

    private static String diagnosticStateKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncDiagnosticStateKey(context, key);
    }

    private static String diagnosticVerdictEvidenceKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncDiagnosticVerdictEvidenceKey(context, key);
    }

    private static String diagnosticVerdictKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncDiagnosticVerdictKey(context, key);
    }

    private static String syncEventRecordKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEventRecordKeys", key);
    }

    private static String verdictMetricKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncDiagnosticQueryRules.verdictMetricKey(context, key);
    }
}
