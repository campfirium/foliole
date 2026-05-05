package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticVerdicts {
    private static final String FULL_SYNC_COMPLETED_MESSAGE = "Sync fully completed.";

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
            add(verdicts, "android_endpoint_missing", "warning", "This device has no desktop sync address.", connection);
        }
        if (!syncState.has("pack_cursor") || syncState.isNull("pack_cursor")) {
            add(verdicts, "android_pack_cursor_missing", "info", "This device has not applied a sync pack yet.", syncState);
        }
        if (storage.optLong("active_node_count", 0) == 0 && hasCompletedEvent(context, events)) {
            add(verdicts, "android_no_nodes_after_completed_sync", "error", "Completed sync left no topics on this device.", storage);
        }
        if (content.optLong("missing_content_blob_count", 0) > 0) {
            add(verdicts, "android_missing_content_blobs", "info", "Some topic bodies are still downloading.", content);
        }
        if (content.optLong("missing_attachment_resource_count", 0) > 0) {
            add(verdicts, "android_missing_attachment_resources", "info", "Some attachment files are still downloading.", content);
        }
        JSONObject failed = recentFailedEvent(context, events);
        if (failed != null) {
            JSObject evidence = new JSObject();
            evidence.put("message", failed.optString("message"));
            evidence.put("occurred_at", failed.optString("occurred_at"));
            add(verdicts, "android_recent_sync_failed", "error", "Recent sync activity failed.", evidence);
        }
        if (syncState.optLong("local_dirty_count", 0) > 0) {
            add(verdicts, "android_has_local_dirty_state", "info", "This device has changes waiting to send.", syncState);
        }
        if (syncState.optLong("pending_ack_count", 0) > 0) {
            add(verdicts, "android_has_pending_push_ack", "info", "Desktop accepted changes that are waiting for pull confirmation.", syncState);
        }
        if (syncState.optLong("push_issue_count", 0) > 0) {
            add(verdicts, "android_has_push_issues", "warning", "Some device changes need review before they can be sent.", syncState);
        }
        if (verdicts.length() == 0) {
            add(verdicts, "android_ready", "ok", "Android sync state is readable.", storage);
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
                FULL_SYNC_COMPLETED_MESSAGE.equals(event.optString("message"))
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

    private static String syncEventSkippedStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "skippedStatus");
    }

    private static void add(JSArray verdicts, String code, String severity, String message, JSObject evidence) {
        JSObject verdict = new JSObject();
        verdict.put("code", code);
        verdict.put("severity", severity);
        verdict.put("message", message);
        verdict.put("evidence", evidence);
        verdicts.put(verdict);
    }
}
