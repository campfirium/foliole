package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionPairingProtocolStore {
    private static final int CURRENT_PROTOCOL_VERSION = 2;

    private FolioleCompanionPairingProtocolStore() {}

    static void addState(Context context, SharedPreferences prefs, JSObject result, boolean hasCredentials) throws Exception {
        String protocolJson = prefs.getString(
            FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolPreferenceKey(context),
            null
        );
        int negotiatedVersion = prefs.getInt(
            FolioleCompanionBridgeContractDefinitions.pairingNegotiatedProtocolVersionPreferenceKey(context),
            0
        );
        boolean usable = hasCredentials && protocolJson != null && negotiatedVersion == CURRENT_PROTOCOL_VERSION;
        result.put(FolioleCompanionBridgeContractDefinitions.pairingNegotiatedProtocolVersionStateKey(context),
            negotiatedVersion > 0 ? negotiatedVersion : JSONObject.NULL);
        result.put(FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolStateKey(context),
            protocolJson == null ? JSONObject.NULL : new JSONObject(protocolJson));
        result.put(FolioleCompanionBridgeContractDefinitions.pairingRepairRequiredStateKey(context), hasCredentials && !usable);
        result.put(FolioleCompanionBridgeContractDefinitions.pairingSyncUsableStateKey(context), usable);
    }

    static void save(
        Context context,
        SharedPreferences.Editor editor,
        int negotiatedVersion,
        JSObject remoteProtocol
    ) throws Exception {
        if (negotiatedVersion != CURRENT_PROTOCOL_VERSION || remoteProtocol == null) {
            throw new IllegalArgumentException("Incompatible companion pairing protocol metadata.");
        }
        editor.putInt(
            FolioleCompanionBridgeContractDefinitions.pairingNegotiatedProtocolVersionPreferenceKey(context),
            negotiatedVersion
        );
        editor.putString(
            FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolPreferenceKey(context),
            remoteProtocol.toString()
        );
    }

    static void clear(Context context, SharedPreferences.Editor editor) throws Exception {
        editor.remove(FolioleCompanionBridgeContractDefinitions.pairingNegotiatedProtocolVersionPreferenceKey(context));
        editor.remove(FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolPreferenceKey(context));
    }

    static void assertUsable(Context context, SharedPreferences prefs) throws Exception {
        String protocolJson = prefs.getString(
            FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolPreferenceKey(context),
            null
        );
        int negotiatedVersion = prefs.getInt(
            FolioleCompanionBridgeContractDefinitions.pairingNegotiatedProtocolVersionPreferenceKey(context),
            0
        );
        if (protocolJson == null || negotiatedVersion != CURRENT_PROTOCOL_VERSION) {
            throw new IllegalStateException("Pairing must be repaired before sync requests can be signed.");
        }
    }
}
