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
        result.put(diagnosticOutputKey(context, "collectedAt"), collectedAt);
        result.put(diagnosticOutputKey(context, "host"), FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncDiagnostics", "host"));
        result.put(diagnosticOutputKey(context, "identity"), loadIdentity(context, databasePath));
        result.put(diagnosticOutputKey(context, "connection"), connection);
        result.put(diagnosticOutputKey(context, "storage"), storage);
        result.put(diagnosticOutputKey(context, "syncState"), syncState);
        JSObject content = FolioleCompanionSyncDiagnosticContent.load(context, database);
        JSArray events = loadEvents(context, database);
        result.put(diagnosticOutputKey(context, "content"), content);
        result.put(diagnosticOutputKey(context, "events"), events);
        result.put(diagnosticOutputKey(context, "verdicts"), FolioleCompanionSyncDiagnosticVerdicts.build(context, connection, storage, syncState, content, events));
        return result;
    }

    private static JSObject loadIdentity(Context context, String databasePath) throws Exception {
        JSObject pairing = FolioleCompanionPairingStore.loadPairingState(context);
        JSObject identity = new JSObject();
        identity.put(diagnosticIdentityKey(context, "appVersion"), null);
        identity.put(diagnosticIdentityKey(context, "databasePath"), databasePath);
        identity.put(diagnosticIdentityKey(context, "deviceId"), pairing.optString(diagnosticIdentityKey(context, "deviceId"), null));
        identity.put(diagnosticIdentityKey(context, "deviceName"), pairing.optString(diagnosticIdentityKey(context, "deviceName"), null));
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
        connection.put(diagnosticConnectionKey(context, "endpointUrl"), endpointUrl == null ? JSONObject.NULL : endpointUrl);
        connection.put(diagnosticConnectionKey(context, "lastError"), JSONObject.NULL);
        String state = pairing.optBoolean("is_paired", false) && endpointUrl != null
            ? FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "ready")
            : FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "missing");
        connection.put(diagnosticConnectionKey(context, "state"), state);
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

    private static String diagnosticConnectionKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncDiagnosticConnectionKey(context, key);
    }

    private static String diagnosticIdentityKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncDiagnosticIdentityKey(context, key);
    }

    private static String diagnosticOutputKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncDiagnosticOutputKey(context, key);
    }

}
