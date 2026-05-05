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
        if (connection.optString("endpoint_url", null) == null) {
            add(context, verdicts, "endpointMissing", connection);
        }
        if (!syncState.has("pack_cursor") || syncState.isNull("pack_cursor")) {
            add(context, verdicts, "packCursorMissing", syncState);
        }
        if (storage.optLong("active_node_count", 0) == 0 && hasCompletedEvent(context, events)) {
            add(context, verdicts, "noNodesAfterCompletedSync", storage);
        }
        if (content.optLong("missing_content_blob_count", 0) > 0) {
            add(context, verdicts, "missingContentBlobs", content);
        }
        if (content.optLong("missing_attachment_resource_count", 0) > 0) {
            add(context, verdicts, "missingAttachmentResources", content);
        }
        JSONObject failed = recentFailedEvent(context, events);
        if (failed != null) {
            JSObject evidence = new JSObject();
            evidence.put("message", failed.optString("message"));
            evidence.put("occurred_at", failed.optString("occurred_at"));
            add(context, verdicts, "recentSyncFailed", evidence);
        }
        if (syncState.optLong("local_dirty_count", 0) > 0) {
            add(context, verdicts, "hasLocalDirtyState", syncState);
        }
        if (syncState.optLong("pending_ack_count", 0) > 0) {
            add(context, verdicts, "hasPendingPushAck", syncState);
        }
        if (syncState.optLong("push_issue_count", 0) > 0) {
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
                completedStatus.equals(event.optString("status")) &&
                fullSyncCompletedMessage(context).equals(event.optString("message"))
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
            String status = event.optString("status");
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
        verdict.put("code", definition.getString("code"));
        verdict.put("severity", definition.getString("severity"));
        verdict.put("message", definition.getString("message"));
        verdict.put("evidence", evidence);
        verdicts.put(verdict);
    }
}
