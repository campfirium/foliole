package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

final class FolioleCompanionNsdProtocolTxt {
    private static final List<String> CONTRACT_KEYS = Arrays.asList(
        "deviceId", "groupId", "groupTag", "maxSupportedVersion", "minSupportedVersion",
        "providerPlatform", "topologyRole", "version"
    );

    private FolioleCompanionNsdProtocolTxt() {}

    static JSObject read(Context context, Map<String, byte[]> attributes) throws Exception {
        JSObject result = new JSObject();
        for (String contractKey : CONTRACT_KEYS) {
            String txtKey = FolioleCompanionHostBridgeContractDefinitions
                .networkProtocolTxtKey(context, contractKey);
            byte[] value = attributes.get(txtKey);
            if (value != null) result.put(txtKey, new String(value, StandardCharsets.UTF_8));
        }
        return result;
    }

    static List<String> contractKeys() {
        return CONTRACT_KEYS;
    }
}
