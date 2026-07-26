package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;

final class FolioleCompanionPairingMetadata {
    private FolioleCompanionPairingMetadata() {}

    static void addState(Context context, SharedPreferences prefs, JSObject result) throws Exception {
        result.put(
            FolioleCompanionPairingPeerContractDefinitions.remotePeerIdStateKey(context),
            trimToNull(prefs.getString(FolioleCompanionPairingPeerContractDefinitions.remotePeerIdPreferenceKey(context), null))
        );
        result.put(
            FolioleCompanionPairingPeerContractDefinitions.remotePeerNameStateKey(context),
            trimToNull(prefs.getString(FolioleCompanionPairingPeerContractDefinitions.remotePeerNamePreferenceKey(context), null))
        );
        result.put(
            FolioleCompanionPairingPeerContractDefinitions.remotePeerPlatformStateKey(context),
            trimToNull(prefs.getString(FolioleCompanionPairingPeerContractDefinitions.remotePeerPlatformPreferenceKey(context), null))
        );
    }

    static void saveRemotePeer(
        Context context,
        SharedPreferences.Editor editor,
        String remotePeerId,
        String remotePeerName,
        String remotePeerPlatform
    ) throws Exception {
        putOptional(editor, FolioleCompanionPairingPeerContractDefinitions.remotePeerIdPreferenceKey(context), remotePeerId);
        putOptional(editor, FolioleCompanionPairingPeerContractDefinitions.remotePeerNamePreferenceKey(context), remotePeerName);
        putOptional(editor, FolioleCompanionPairingPeerContractDefinitions.remotePeerPlatformPreferenceKey(context), remotePeerPlatform);
    }

    static void clear(Context context, SharedPreferences.Editor editor) throws Exception {
        editor
            .remove(FolioleCompanionPairingPeerContractDefinitions.remotePeerIdPreferenceKey(context))
            .remove(FolioleCompanionPairingPeerContractDefinitions.remotePeerNamePreferenceKey(context))
            .remove(FolioleCompanionPairingPeerContractDefinitions.remotePeerPlatformPreferenceKey(context));
    }

    private static void putOptional(SharedPreferences.Editor editor, String key, String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            editor.remove(key);
        } else {
            editor.putString(key, normalized);
        }
    }

    private static String trimToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
