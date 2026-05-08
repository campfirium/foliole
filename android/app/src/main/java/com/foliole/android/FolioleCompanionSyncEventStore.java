package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

final class FolioleCompanionSyncEventStore {
    private static final int MAX_FINISHED_RUNS = 20;

    private FolioleCompanionSyncEventStore() {}

    static List<JSONObject> load(Context context, SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionMetaRecords.loadValue(context, database, syncMetaKey(context, "events"));
        List<JSONObject> events = new ArrayList<>();
        if (stored == null || stored.trim().isEmpty()) {
            return events;
        }
        JSONArray items = new JSONArray(stored);
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject event = items.optJSONObject(index);
            if (event != null) events.add(event);
        }
        return events;
    }

    static void save(Context context, SQLiteDatabase database, SyncEventInput input) throws Exception {
        JSONArray nextEvents = compactEvents(buildEvents(context, database, input));
        FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "events"), nextEvents.toString(), Instant.now().toString());
        JSONObject event = nextEvents.optJSONObject(0);
        if (event != null && isConfirmedProgress(context, event)) {
            String occurredAt = event.optString(syncEventRecordKey(context, "occurredAt"), "");
            FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "lastSyncedAt"), occurredAt, occurredAt);
        }
    }

    private static List<JSONObject> buildEvents(Context context, SQLiteDatabase database, SyncEventInput input) throws Exception {
        List<JSONObject> events = load(context, database);
        events.add(0, createEvent(context, input));
        return events;
    }

    private static JSONObject createEvent(Context context, SyncEventInput input) throws Exception {
        JSONObject event = new JSONObject();
        String status = normalizeSyncEventStatus(context, input.status);
        event.put(syncEventRecordKey(context, "id"), UUID.randomUUID().toString());
        event.put(syncEventRecordKey(context, "endpointUrl"), input.endpointUrl == null || input.endpointUrl.trim().isEmpty() ? JSONObject.NULL : input.endpointUrl.trim());
        event.put(syncEventRecordKey(context, "status"), status);
        event.put(syncEventRecordKey(context, "message"), input.message == null || input.message.trim().isEmpty() ? status : input.message.trim());
        event.put(syncEventRecordKey(context, "occurredAt"), input.occurredAt == null || input.occurredAt.trim().isEmpty() ? Instant.now().toString() : input.occurredAt.trim());
        putOptional(event, "kind", input.kind);
        putOptional(event, "result", input.result);
        putOptional(event, "run_id", input.runId);
        putOptional(event, "started_at", input.startedAt);
        return event;
    }

    private static JSONArray compactEvents(List<JSONObject> events) {
        JSONArray compacted = new JSONArray();
        Set<String> keptRunIds = keptFinishedRunIds(events);
        keptRunIds.addAll(keptUnfinishedRunIds(events));
        for (JSONObject event : events) {
            String runId = event.optString("run_id", "");
            if ((isRunFinished(event) && (runId.isEmpty() || keptRunIds.contains(runId))) || keptRunIds.contains(runId)) {
                compacted.put(event);
            }
        }
        return compacted;
    }

    private static Set<String> keptFinishedRunIds(List<JSONObject> events) {
        Set<String> keptRunIds = new HashSet<>();
        int finishedRuns = 0;
        for (JSONObject event : events) {
            if (!isRunFinished(event)) continue;
            if (finishedRuns >= MAX_FINISHED_RUNS) break;
            finishedRuns += 1;
            String runId = event.optString("run_id", "");
            if (!runId.isEmpty()) keptRunIds.add(runId);
        }
        return keptRunIds;
    }

    private static Set<String> keptUnfinishedRunIds(List<JSONObject> events) {
        Set<String> finishedRunIds = new HashSet<>();
        Set<String> unfinishedRunIds = new HashSet<>();
        for (JSONObject event : events) {
            String runId = event.optString("run_id", "");
            if (runId.isEmpty()) continue;
            if (isRunFinished(event)) {
                finishedRunIds.add(runId);
            } else if ("run_started".equals(event.optString("kind", "")) && !finishedRunIds.contains(runId)) {
                unfinishedRunIds.add(runId);
            }
        }
        return unfinishedRunIds;
    }

    private static boolean isRunFinished(JSONObject event) {
        String kind = event.optString("kind", "");
        if ("run_finished".equals(kind)) return true;
        if (!kind.isEmpty() && !"legacy_event".equals(kind)) return false;
        return !"started".equals(event.optString("status", ""));
    }

    private static boolean isConfirmedProgress(Context context, JSONObject event) throws Exception {
        String result = event.optString("result", "");
        if ("completed".equals(result) || "partial".equals(result)) return true;
        if ("blocked".equals(result) || "failed".equals(result) || "cancelled".equals(result) || "system_fault".equals(result) || "waiting".equals(result)) return false;
        String status = event.optString(syncEventRecordKey(context, "status"));
        String message = event.optString(syncEventRecordKey(context, "message"));
        return syncEventSkippedStatus(context).equals(status) ||
            (syncEventCompletedStatus(context).equals(status) && syncEventFullCompletedMessage(context).equals(message));
    }

    private static void putOptional(JSONObject event, String key, String value) throws Exception {
        if (value != null && !value.trim().isEmpty()) event.put(key, value.trim());
    }

    private static String normalizeSyncEventStatus(Context context, String status) throws Exception {
        String fallbackStatus = syncEventFallbackStatus(context);
        if (status == null) return fallbackStatus;
        String normalized = status.trim();
        return syncEventStatuses(context).contains(normalized) ? normalized : fallbackStatus;
    }

    private static Set<String> syncEventStatuses(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringSet(context, "syncEvents", "statuses");
    }

    private static String syncEventCompletedStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "completedStatus");
    }

    private static String syncEventFallbackStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "fallbackStatus");
    }

    private static String syncEventFullCompletedMessage(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "fullSyncCompletedMessage");
    }

    private static String syncEventSkippedStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEvents", "skippedStatus");
    }

    private static String syncMetaKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaKeys", key);
    }

    private static String syncEventRecordKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEventRecordKeys", key);
    }

    static final class SyncEventInput {
        final String endpointUrl;
        final String kind;
        final String message;
        final String occurredAt;
        final String result;
        final String runId;
        final String startedAt;
        final String status;

        SyncEventInput(String endpointUrl, String status, String message, String occurredAt, String kind, String result, String runId, String startedAt) {
            this.endpointUrl = endpointUrl;
            this.status = status;
            this.message = message;
            this.occurredAt = occurredAt;
            this.kind = kind;
            this.result = result;
            this.runId = runId;
            this.startedAt = startedAt;
        }
    }
}
