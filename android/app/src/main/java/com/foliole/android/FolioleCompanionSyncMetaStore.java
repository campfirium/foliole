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

    private static final String WORKSPACE_SYNC_ENDPOINT_URL_KEY = "workspace_sync_endpoint_url";
    private static final String WORKSPACE_SYNC_LAST_SYNCED_AT_KEY = "workspace_sync_last_synced_at";
    private static final String WORKSPACE_SYNC_ONBOARDING_STATUS_KEY = "workspace_sync_onboarding_status";
    private static final String WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY = "workspace_sync_remembered_targets";
    private static final String WORKSPACE_SYNC_EVENTS_KEY = "workspace_sync_events";
    private static final String FULL_SYNC_COMPLETED_MESSAGE = "Sync fully completed.";

    private FolioleCompanionSyncMetaStore() {}

    static JSObject loadWorkspaceSyncState(Context context, SQLiteDatabase database) throws Exception {
        JSObject result = new JSObject();
        String endpointUrl = FolioleCompanionMetaRecords.loadValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        String lastSyncedAt = FolioleCompanionMetaRecords.loadValue(context, database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY);
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        JSObject workspaceSnapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(context, database, deviceId);
        result.put("endpoint_url", endpointUrl);
        result.put("last_synced_at", lastSyncedAt);
        result.put("remembered_targets", new JSONArray(loadRememberedTargets(context, database)));
        result.put("sync_events", new JSONArray(loadSyncEvents(context, database)));
        result.put("sync_onboarding_status", loadSyncOnboardingStatus(context, database, lastSyncedAt, workspaceSnapshot));
        result.put("workspace_snapshot", workspaceSnapshot);
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
        return loadWorkspaceSyncState(context, database);
    }

    static JSObject saveSyncOnboardingStatus(Context context, SQLiteDatabase database, String status) throws Exception {
        FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_ONBOARDING_STATUS_KEY, normalizeSyncOnboardingStatus(context, status), Instant.now().toString());
        return loadWorkspaceSyncState(context, database);
    }

    static JSObject saveWorkspaceSyncEndpoint(Context context, SQLiteDatabase database, String endpointUrl) throws Exception {
        String now = Instant.now().toString();
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            FolioleCompanionMetaRecords.deleteValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        } else {
            String normalizedEndpointUrl = endpointUrl.trim();
            FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, normalizedEndpointUrl, now);
            saveRememberedTargets(context, database, appendRememberedTarget(loadRememberedTargets(context, database), normalizedEndpointUrl), now);
        }
        return loadWorkspaceSyncState(context, database);
    }

    static JSObject removeWorkspaceSyncRememberedTarget(Context context, SQLiteDatabase database, String endpointUrl) throws Exception {
        String now = Instant.now().toString();
        String normalizedEndpointUrl = endpointUrl.trim();
        List<String> nextTargets = removeRememberedTarget(loadRememberedTargets(context, database), normalizedEndpointUrl);
        saveRememberedTargets(context, database, nextTargets, now);
        String currentEndpointUrl = FolioleCompanionMetaRecords.loadValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        if (normalizedEndpointUrl.equals(currentEndpointUrl)) {
            if (nextTargets.isEmpty()) {
                FolioleCompanionMetaRecords.deleteValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
            } else {
                FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, nextTargets.get(0), now);
            }
        }
        return loadWorkspaceSyncState(context, database);
    }

    private static List<JSONObject> loadSyncEvents(Context context, SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionMetaRecords.loadValue(context, database, WORKSPACE_SYNC_EVENTS_KEY);
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
        event.put("id", UUID.randomUUID().toString());
        event.put("endpoint_url", endpointUrl == null || endpointUrl.trim().isEmpty() ? JSONObject.NULL : endpointUrl.trim());
        event.put("status", normalizedStatus);
        event.put("message", message == null || message.trim().isEmpty() ? normalizedStatus : message.trim());
        event.put("occurred_at", normalizedOccurredAt);
        nextEvents.put(event);
        for (int index = 0; index < events.size() && index < 19; index += 1) {
            nextEvents.put(events.get(index));
        }
        FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_EVENTS_KEY, nextEvents.toString(), Instant.now().toString());
        if (
            syncEventSkippedStatus(context).equals(normalizedStatus) ||
            (syncEventCompletedStatus(context).equals(normalizedStatus) && FULL_SYNC_COMPLETED_MESSAGE.equals(event.optString("message")))
        ) {
            FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY, normalizedOccurredAt, normalizedOccurredAt);
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
        String stored = FolioleCompanionMetaRecords.loadValue(context, database, WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY);
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
        String status = FolioleCompanionMetaRecords.loadValue(context, database, WORKSPACE_SYNC_ONBOARDING_STATUS_KEY);
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
        FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY, new JSONArray(rememberedTargets).toString(), updatedAt);
    }
}
