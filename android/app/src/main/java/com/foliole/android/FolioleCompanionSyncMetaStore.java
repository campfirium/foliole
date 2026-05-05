package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
        String endpointUrl = FolioleCompanionMetaRecords.loadValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        String lastSyncedAt = FolioleCompanionMetaRecords.loadValue(database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY);
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        JSObject workspaceSnapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(context, database, deviceId);
        result.put("endpoint_url", endpointUrl);
        result.put("last_synced_at", lastSyncedAt);
        result.put("remembered_targets", new JSONArray(loadRememberedTargets(database)));
        result.put("sync_events", new JSONArray(loadSyncEvents(database)));
        result.put("sync_onboarding_status", loadSyncOnboardingStatus(database, lastSyncedAt, workspaceSnapshot));
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
        FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_ONBOARDING_STATUS_KEY, normalizeSyncOnboardingStatus(status), Instant.now().toString());
        return loadWorkspaceSyncState(context, database);
    }

    static JSObject saveWorkspaceSyncEndpoint(Context context, SQLiteDatabase database, String endpointUrl) throws Exception {
        String now = Instant.now().toString();
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            FolioleCompanionMetaRecords.deleteValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        } else {
            String normalizedEndpointUrl = endpointUrl.trim();
            FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, normalizedEndpointUrl, now);
            saveRememberedTargets(context, database, appendRememberedTarget(loadRememberedTargets(database), normalizedEndpointUrl), now);
        }
        return loadWorkspaceSyncState(context, database);
    }

    static JSObject removeWorkspaceSyncRememberedTarget(Context context, SQLiteDatabase database, String endpointUrl) throws Exception {
        String now = Instant.now().toString();
        String normalizedEndpointUrl = endpointUrl.trim();
        List<String> nextTargets = removeRememberedTarget(loadRememberedTargets(database), normalizedEndpointUrl);
        saveRememberedTargets(context, database, nextTargets, now);
        String currentEndpointUrl = FolioleCompanionMetaRecords.loadValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        if (normalizedEndpointUrl.equals(currentEndpointUrl)) {
            if (nextTargets.isEmpty()) {
                FolioleCompanionMetaRecords.deleteValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
            } else {
                FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, nextTargets.get(0), now);
            }
        }
        return loadWorkspaceSyncState(context, database);
    }

    private static List<JSONObject> loadSyncEvents(SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionMetaRecords.loadValue(database, WORKSPACE_SYNC_EVENTS_KEY);
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
        List<JSONObject> events = loadSyncEvents(database);
        JSONArray nextEvents = new JSONArray();
        String normalizedStatus = normalizeSyncEventStatus(status);
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
        if ("skipped".equals(normalizedStatus) || ("completed".equals(normalizedStatus) && FULL_SYNC_COMPLETED_MESSAGE.equals(event.optString("message")))) {
            FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY, normalizedOccurredAt, normalizedOccurredAt);
        }
    }

    private static String normalizeSyncEventStatus(String status) {
        if (status == null) {
            return "failed";
        }
        String normalized = status.trim();
        if (normalized.equals("started") || normalized.equals("completed") || normalized.equals("failed") || normalized.equals("skipped")) {
            return normalized;
        }
        return "failed";
    }

    private static List<String> loadRememberedTargets(SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionMetaRecords.loadValue(database, WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY);
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

    private static String loadSyncOnboardingStatus(SQLiteDatabase database, String lastSyncedAt, JSObject workspaceSnapshot) {
        String status = FolioleCompanionMetaRecords.loadValue(database, WORKSPACE_SYNC_ONBOARDING_STATUS_KEY);
        if (isValidSyncOnboardingStatus(status)) {
            return status.trim();
        }
        return lastSyncedAt != null || workspaceSnapshot != null ? "completed" : "pending";
    }

    private static String normalizeSyncOnboardingStatus(String status) {
        return isValidSyncOnboardingStatus(status) ? status.trim() : "pending";
    }

    private static boolean isValidSyncOnboardingStatus(String status) {
        if (status == null) {
            return false;
        }
        String normalized = status.trim();
        return normalized.equals("accepted") ||
            normalized.equals("completed") ||
            normalized.equals("dismissed") ||
            normalized.equals("pending");
    }

    private static void saveRememberedTargets(Context context, SQLiteDatabase database, List<String> rememberedTargets, String updatedAt) throws Exception {
        FolioleCompanionMetaRecords.saveValue(context, database, WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY, new JSONArray(rememberedTargets).toString(), updatedAt);
    }
}
