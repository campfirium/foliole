package com.foliole.android;

import android.content.Context;

final class FolioleCompanionPairingSignatureContractDefinitions {
    private FolioleCompanionPairingSignatureContractDefinitions() {}

    private static String value(Context context, String section, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.pairingSignatureString(context, section, key);
    }

    static String authorizationIdHeader(Context context) throws Exception {
        return value(context, "headerKeys", "authorizationId");
    }

    static String nonceHeader(Context context) throws Exception {
        return value(context, "headerKeys", "nonce");
    }

    static String signatureHeader(Context context) throws Exception {
        return value(context, "headerKeys", "signature");
    }

    static String timestampHeader(Context context) throws Exception {
        return value(context, "headerKeys", "timestamp");
    }

    static String bodyHashRequest(Context context) throws Exception {
        return value(context, "requestKeys", "bodyHash");
    }

    static String endpointUrlRequest(Context context) throws Exception {
        return value(context, "requestKeys", "endpointUrl");
    }

    static String methodRequest(Context context) throws Exception {
        return value(context, "requestKeys", "method");
    }

    static String nonceRequest(Context context) throws Exception {
        return value(context, "requestKeys", "nonce");
    }

    static String pathWithQueryRequest(Context context) throws Exception {
        return value(context, "requestKeys", "pathWithQuery");
    }

    static String syncGroupIdRequest(Context context) throws Exception {
        return value(context, "requestKeys", "syncGroupId");
    }

    static String timestampRequest(Context context) throws Exception {
        return value(context, "requestKeys", "timestamp");
    }

    static String workgroupKeyRequest(Context context) throws Exception {
        return value(context, "requestKeys", "workgroupKey");
    }

    static String headersResponse(Context context) throws Exception {
        return value(context, "responseKeys", "headers");
    }
}
