package com.foliole.android;

import android.content.Context;

final class FolioleCompanionPairingPeerContractDefinitions {
    private FolioleCompanionPairingPeerContractDefinitions() {}

    static String remotePeerIdCredentialRequestKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingCredentialRequestKey(context, "remotePeerId");
    }

    static String remotePeerNameCredentialRequestKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingCredentialRequestKey(context, "remotePeerName");
    }

    static String remotePeerPlatformCredentialRequestKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingCredentialRequestKey(context, "remotePeerPlatform");
    }

    static String remotePeerIdPreferenceKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingPreferenceKey(context, "remotePeerId");
    }

    static String remotePeerNamePreferenceKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingPreferenceKey(context, "remotePeerName");
    }

    static String remotePeerPlatformPreferenceKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingPreferenceKey(context, "remotePeerPlatform");
    }

    static String remotePeerIdStateKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingStateKey(context, "remotePeerId");
    }

    static String remotePeerNameStateKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingStateKey(context, "remotePeerName");
    }

    static String remotePeerPlatformStateKey(Context context) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingStateKey(context, "remotePeerPlatform");
    }
}
