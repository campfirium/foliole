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
        JSONObject outputKeys = diagnosticObject(context, "outputKeys");
        result.put(outputKeys.getString("collectedAt"), collectedAt);
        result.put(outputKeys.getString("host"), FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncDiagnostics", "host"));
        result.put(outputKeys.getString("identity"), loadIdentity(context, databasePath));
        result.put(outputKeys.getString("connection"), connection);
        result.put(outputKeys.getString("storage"), storage);
        result.put(outputKeys.getString("syncState"), syncState);
        JSObject content = FolioleCompanionSyncDiagnosticContent.load(context, database);
        JSArray events = loadEvents(context, database);
        result.put(outputKeys.getString("content"), content);
        result.put(outputKeys.getString("events"), events);
        result.put(outputKeys.getString("verdicts"), FolioleCompanionSyncDiagnosticVerdicts.build(context, connection, storage, syncState, content, events));
        return result;
    }

    private static JSObject loadIdentity(Context context, String databasePath) throws Exception {
        JSObject pairing = FolioleCompanionPairingStore.loadPairingState(context);
        JSONObject identityKeys = diagnosticObject(context, "identityKeys");
        JSObject identity = new JSObject();
        identity.put(identityKeys.getString("appVersion"), null);
        identity.put(identityKeys.getString("databasePath"), databasePath);
        identity.put(identityKeys.getString("deviceId"), pairing.optString(identityKeys.getString("deviceId"), null));
        identity.put(identityKeys.getString("deviceName"), pairing.optString(identityKeys.getString("deviceName"), null));
        return identity;
    }

    private static JSObject loadConnection(Context context, SQLiteDatabase database) throws Exception {
        JSObject pairing = FolioleCompanionPairingStore.loadPairingState(context);
        String endpointUrl = FolioleCompanionSyncDiagnosticMeta.load(
            context,
            database,
            FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaKeys", "endpointUrl")
        );
        JSONObject connectionKeys = diagnosticObject(context, "connectionKeys");
        JSObject connection = new JSObject();
        connection.put(connectionKeys.getString("endpointUrl"), endpointUrl == null ? JSONObject.NULL : endpointUrl);
        connection.put(connectionKeys.getString("lastError"), JSONObject.NULL);
        String state = pairing.optBoolean("is_paired", false) && endpointUrl != null
            ? FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "ready")
            : FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "missing");
        connection.put(connectionKeys.getString("state"), state);
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

    private static JSONObject diagnosticObject(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.objectValue(context, "syncDiagnostics", key);
    }

}
