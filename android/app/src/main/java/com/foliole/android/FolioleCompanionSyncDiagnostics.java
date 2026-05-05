package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncDiagnostics {
    private FolioleCompanionSyncDiagnostics() {}

    static JSObject diagnose(Context context, SQLiteDatabase database, String databasePath) throws Exception {
        String collectedAt = Instant.now().toString();
        JSObject storage = FolioleCompanionSyncDiagnosticStorage.load(database);
        JSObject syncState = FolioleCompanionSyncDiagnosticState.load(database);
        JSObject connection = loadConnection(context, database);
        JSObject result = new JSObject();
        result.put("collected_at", collectedAt);
        result.put("host", "android");
        result.put("identity", loadIdentity(context, databasePath));
        result.put("connection", connection);
        result.put("storage", storage);
        result.put("sync_state", syncState);
        JSObject content = FolioleCompanionSyncDiagnosticContent.load(context, database);
        JSArray events = loadEvents(database);
        result.put("content", content);
        result.put("events", events);
        result.put("verdicts", FolioleCompanionSyncDiagnosticVerdicts.build(connection, storage, syncState, content, events));
        return result;
    }

    private static JSObject loadIdentity(Context context, String databasePath) throws Exception {
        JSObject pairing = FolioleCompanionPairingStore.loadPairingState(context);
        JSObject identity = new JSObject();
        identity.put("app_version", null);
        identity.put("database_path", databasePath);
        identity.put("device_id", pairing.optString("device_id", null));
        identity.put("device_name", pairing.optString("device_name", null));
        return identity;
    }

    private static JSObject loadConnection(Context context, SQLiteDatabase database) throws Exception {
        JSObject pairing = FolioleCompanionPairingStore.loadPairingState(context);
        String endpointUrl = FolioleCompanionSyncDiagnosticMeta.load(database, "workspace_sync_endpoint_url");
        JSObject connection = new JSObject();
        connection.put("endpoint_url", endpointUrl == null ? JSONObject.NULL : endpointUrl);
        connection.put("last_error", JSONObject.NULL);
        connection.put("state", pairing.optBoolean("is_paired", false) && endpointUrl != null ? "ready" : "missing");
        return connection;
    }

    private static JSArray loadEvents(SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionSyncDiagnosticMeta.load(database, "workspace_sync_events");
        if (stored == null) {
            return new JSArray();
        }
        JSONArray storedEvents = new JSONArray(stored);
        JSArray events = new JSArray();
        for (int index = 0; index < storedEvents.length(); index += 1) {
            events.put(storedEvents.get(index));
        }
        return events;
    }

}
