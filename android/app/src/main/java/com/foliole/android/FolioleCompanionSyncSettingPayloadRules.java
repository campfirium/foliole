package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncSettingPayloadRules {
    private FolioleCompanionSyncSettingPayloadRules() {}

    static String key(Context context, JSONObject input) throws Exception {
        return input.optString(metadata(context, "keyPayloadKey"));
    }

    static String scope(Context context, JSONObject input) throws Exception {
        return input.optString(metadata(context, "scopePayloadKey"), metadata(context, "defaultScope"));
    }

    static String platform(Context context, JSONObject input) throws Exception {
        return input.optString(metadata(context, "platformPayloadKey"), metadata(context, "defaultPlatform"));
    }

    static String formFactor(Context context, JSONObject input) throws Exception {
        return input.optString(metadata(context, "formFactorPayloadKey"), metadata(context, "defaultFormFactor"));
    }

    static String deviceId(Context context, JSONObject input) throws Exception {
        return input.optString(metadata(context, "deviceIdPayloadKey"), metadata(context, "defaultDeviceId"));
    }

    static String valueJson(Context context, JSONObject input) throws Exception {
        return input.optString(metadata(context, "valueJsonPayloadKey"), metadata(context, "defaultValueJson"));
    }

    static String objectId(
        Context context,
        String scope,
        String platform,
        String formFactor,
        String deviceId,
        String key
    ) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.scopedObjectId(context, scope, platform, formFactor, deviceId, key);
    }

    static JSONObject payload(
        Context context,
        String key,
        String scope,
        String platform,
        String formFactor,
        String deviceId,
        String valueJson
    ) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put(metadata(context, "deviceIdPayloadKey"), deviceId);
        payload.put(metadata(context, "formFactorPayloadKey"), formFactor);
        payload.put(metadata(context, "keyPayloadKey"), key);
        payload.put(metadata(context, "platformPayloadKey"), platform);
        payload.put(metadata(context, "scopePayloadKey"), scope);
        payload.put(metadata(context, "valueJsonPayloadKey"), valueJson);
        return payload;
    }

    private static String metadata(Context context, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.settingMetadata(context, key);
    }
}
