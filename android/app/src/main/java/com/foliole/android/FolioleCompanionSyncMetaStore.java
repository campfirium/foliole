package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

final class FolioleCompanionSyncMetaStore {

    private FolioleCompanionSyncMetaStore() {}

    static JSObject loadWorkspaceSyncState(Context context, SQLiteDatabase database) throws Exception {
        return loadWorkspaceSyncState(context, database, true);
    }

    private static JSObject loadWorkspaceSyncState(Context context, SQLiteDatabase database, boolean includeWorkspaceSnapshot) throws Exception {
        JSObject result = new JSObject();
        String endpointUrl = FolioleCompanionMetaRecords.loadValue(context, database, syncMetaKey(context, "endpointUrl"));
        String lastSyncedAt = FolioleCompanionMetaRecords.loadValue(context, database, syncMetaKey(context, "lastSyncedAt"));
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        JSObject workspaceSnapshot = includeWorkspaceSnapshot
            ? FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(context, database, deviceId)
            : null;
        result.put(syncMetaOutputKey(context, "endpointUrl"), endpointUrl);
        result.put(syncMetaOutputKey(context, "lastSyncedAt"), lastSyncedAt);
        result.put(syncMetaOutputKey(context, "rememberedTargets"), new JSONArray(loadRememberedTargets(context, database)));
        result.put(syncMetaOutputKey(context, "syncEvents"), new JSONArray(loadSyncEvents(context, database)));
        result.put(syncMetaOutputKey(context, "syncOnboardingStatus"), loadSyncOnboardingStatus(context, database, lastSyncedAt, workspaceSnapshot));
        result.put(syncMetaOutputKey(context, "workspaceSnapshot"), workspaceSnapshot);
        return result;
    }

    static JSObject recordWorkspaceSyncEvent(
        Context context,
        SQLiteDatabase database,
        String endpointUrl,
        String status,
        String message,
        String occurredAt
    ) throws Exception {
        saveSyncEvent(context, database, endpointUrl, status, message, occurredAt);
        return loadWorkspaceSyncState(context, database, false);
    }

    static JSObject saveSyncOnboardingStatus(Context context, SQLiteDatabase database, String status) throws Exception {
        FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "onboardingStatus"), normalizeSyncOnboardingStatus(context, status), Instant.now().toString());
        return loadWorkspaceSyncState(context, database);
    }

    static JSObject saveWorkspaceSyncEndpoint(Context context, SQLiteDatabase database, String endpointUrl) throws Exception {
        String now = Instant.now().toString();
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            FolioleCompanionMetaRecords.deleteValue(context, database, syncMetaKey(context, "endpointUrl"));
        } else {
            String normalizedEndpointUrl = endpointUrl.trim();
            FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "endpointUrl"), normalizedEndpointUrl, now);
            saveRememberedTargets(context, database, appendRememberedTarget(loadRememberedTargets(context, database), normalizedEndpointUrl), now);
        }
        return loadWorkspaceSyncState(context, database);
    }

    static JSObject removeWorkspaceSyncRememberedTarget(Context context, SQLiteDatabase database, String endpointUrl) throws Exception {
        String now = Instant.now().toString();
        String normalizedEndpointUrl = endpointUrl.trim();
        List<String> nextTargets = removeRememberedTarget(loadRememberedTargets(context, database), normalizedEndpointUrl);
        saveRememberedTargets(context, database, nextTargets, now);
        String currentEndpointUrl = FolioleCompanionMetaRecords.loadValue(context, database, syncMetaKey(context, "endpointUrl"));
        if (normalizedEndpointUrl.equals(currentEndpointUrl)) {
            if (nextTargets.isEmpty()) {
                FolioleCompanionMetaRecords.deleteValue(context, database, syncMetaKey(context, "endpointUrl"));
            } else {
                FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "endpointUrl"), nextTargets.get(0), now);
            }
        }
        return loadWorkspaceSyncState(context, database);
    }

    private static List<JSONObject> loadSyncEvents(Context context, SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionMetaRecords.loadValue(context, database, syncMetaKey(context, "events"));
        List<JSONObject> events = new ArrayList<>();
        if (stored == null || stored.trim().isEmpty()) {
            return events;
        }
        JSONArray items = new JSONArray(stored);
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject event = items.optJSONObject(index);
            if (event != null) {
                events.add(event);
            }
        }
        return events;
    }

    private static void saveSyncEvent(Context context, SQLiteDatabase database, String endpointUrl, String status, String message, String occurredAt) throws Exception {
        List<JSONObject> events = loadSyncEvents(context, database);
        JSONArray nextEvents = new JSONArray();
        String normalizedStatus = normalizeSyncEventStatus(context, status);
        String normalizedOccurredAt = occurredAt == null || occurredAt.trim().isEmpty() ? Instant.now().toString() : occurredAt.trim();
        JSONObject event = new JSONObject();
        event.put(syncEventRecordKey(context, "id"), UUID.randomUUID().toString());
        event.put(syncEventRecordKey(context, "endpointUrl"), endpointUrl == null || endpointUrl.trim().isEmpty() ? JSONObject.NULL : endpointUrl.trim());
        event.put(syncEventRecordKey(context, "status"), normalizedStatus);
        event.put(syncEventRecordKey(context, "message"), message == null || message.trim().isEmpty() ? normalizedStatus : message.trim());
        event.put(syncEventRecordKey(context, "occurredAt"), normalizedOccurredAt);
        nextEvents.put(event);
        for (int index = 0; index < events.size() && index < 19; index += 1) {
            nextEvents.put(events.get(index));
        }
        FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "events"), nextEvents.toString(), Instant.now().toString());
        if (
            syncEventSkippedStatus(context).equals(normalizedStatus) ||
            (syncEventCompletedStatus(context).equals(normalizedStatus) && syncEventFullCompletedMessage(context).equals(event.optString(syncEventRecordKey(context, "message"))))
        ) {
            FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "lastSyncedAt"), normalizedOccurredAt, normalizedOccurredAt);
        }
    }

    private static String normalizeSyncEventStatus(Context context, String status) throws Exception {
        String fallbackStatus = syncEventFallbackStatus(context);
        if (status == null) {
            return fallbackStatus;
        }
        String normalized = status.trim();
        return syncEventStatuses(context).contains(normalized) ? normalized : fallbackStatus;
    }

    private static List<String> loadRememberedTargets(Context context, SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionMetaRecords.loadValue(context, database, syncMetaKey(context, "rememberedTargets"));
        List<String> rememberedTargets = new ArrayList<>();
        if (stored == null || stored.trim().isEmpty()) {
            return rememberedTargets;
        }
        JSONArray items = new JSONArray(stored);
        for (int index = 0; index < items.length(); index += 1) {
            String value = items.optString(index, null);
            if (value == null) {
                continue;
            }
            String normalizedValue = value.trim();
            if (!normalizedValue.isEmpty() && !rememberedTargets.contains(normalizedValue)) {
                rememberedTargets.add(normalizedValue);
            }
        }
        return rememberedTargets;
    }

    private static List<String> appendRememberedTarget(List<String> rememberedTargets, String endpointUrl) {
        List<String> nextTargets = new ArrayList<>();
        nextTargets.add(endpointUrl);
        for (String target : rememberedTargets) {
            if (!endpointUrl.equals(target)) {
                nextTargets.add(target);
            }
        }
        return nextTargets;
    }

    private static List<String> removeRememberedTarget(List<String> rememberedTargets, String endpointUrl) {
        List<String> nextTargets = new ArrayList<>();
        for (String target : rememberedTargets) {
            if (!endpointUrl.equals(target)) {
                nextTargets.add(target);
            }
        }
        return nextTargets;
    }

    private static String loadSyncOnboardingStatus(Context context, SQLiteDatabase database, String lastSyncedAt, JSObject workspaceSnapshot) throws Exception {
        String status = FolioleCompanionMetaRecords.loadValue(context, database, syncMetaKey(context, "onboardingStatus"));
        if (isValidSyncOnboardingStatus(context, status)) {
            return status.trim();
        }
        return lastSyncedAt != null || workspaceSnapshot != null ? syncOnboardingCompletedStatus(context) : syncOnboardingFallbackStatus(context);
    }

    private static String normalizeSyncOnboardingStatus(Context context, String status) throws Exception {
        return isValidSyncOnboardingStatus(context, status) ? status.trim() : syncOnboardingFallbackStatus(context);
    }

    private static boolean isValidSyncOnboardingStatus(Context context, String status) throws Exception {
        if (status == null) {
            return false;
        }
        String normalized = status.trim();
        return syncOnboardingStatuses(context).contains(normalized);
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

    private static Set<String> syncOnboardingStatuses(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringSet(context, "syncOnboarding", "statuses");
    }

    private static String syncOnboardingCompletedStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncOnboarding", "completedStatus");
    }

    private static String syncOnboardingFallbackStatus(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncOnboarding", "fallbackStatus");
    }

    private static void saveRememberedTargets(Context context, SQLiteDatabase database, List<String> rememberedTargets, String updatedAt) throws Exception {
        FolioleCompanionMetaRecords.saveValue(context, database, syncMetaKey(context, "rememberedTargets"), new JSONArray(rememberedTargets).toString(), updatedAt);
    }

    private static String syncMetaKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaKeys", key);
    }

    private static String syncMetaOutputKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaOutputKeys", key);
    }

    private static String syncEventRecordKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncEventRecordKeys", key);
    }
}
