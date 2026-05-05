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
        JSObject storage = FolioleCompanionSyncDiagnosticStorage.load(context, database);
        JSObject syncState = FolioleCompanionSyncDiagnosticState.load(context, database);
        JSObject connection = loadConnection(context, database);
        JSObject result = new JSObject();
        result.put("collected_at", collectedAt);
        result.put("host", FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncDiagnostics", "host"));
        result.put("identity", loadIdentity(context, databasePath));
        result.put("connection", connection);
        result.put("storage", storage);
        result.put("sync_state", syncState);
        JSObject content = FolioleCompanionSyncDiagnosticContent.load(context, database);
        JSArray events = loadEvents(context, database);
        result.put("content", content);
        result.put("events", events);
        result.put("verdicts", FolioleCompanionSyncDiagnosticVerdicts.build(context, connection, storage, syncState, content, events));
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
        String endpointUrl = FolioleCompanionSyncDiagnosticMeta.load(
            context,
            database,
            FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaKeys", "endpointUrl")
        );
        JSObject connection = new JSObject();
        connection.put("endpoint_url", endpointUrl == null ? JSONObject.NULL : endpointUrl);
        connection.put("last_error", JSONObject.NULL);
        String state = pairing.optBoolean("is_paired", false) && endpointUrl != null
            ? FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "ready")
            : FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "missing");
        connection.put("state", state);
        return connection;
    }

    private static JSArray loadEvents(Context context, SQLiteDatabase database) throws Exception {
        String stored = FolioleCompanionSyncDiagnosticMeta.load(
            context,
            database,
            FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaKeys", "events")
        );
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
