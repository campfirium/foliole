package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupAuthorizationContract {
    private static final String ASSET = "companion-sync-group-bridge-contract-definitions.json";
    private final JSONObject authorization;
    private final JSONObject headers;
    private final JSONObject requests;
    private final JSONObject states;
    private final JSONObject storage;

    FolioleCompanionSyncGroupAuthorizationContract(Context context) throws Exception {
        JSONObject root = new JSONObject(FolioleCompanionAssetReader.read(context, ASSET));
        authorization = root.getJSONObject("authorization");
        headers = authorization.getJSONObject("headerKeys");
        requests = authorization.getJSONObject("requestKeys");
        states = authorization.getJSONObject("stateKeys");
        storage = authorization.getJSONObject("storage");
    }

    String canonicalVersion() throws Exception { return authorization.getJSONObject("canonical").getString("version"); }
    String header(String name) throws Exception { return headers.getString(name); }
    String prepareToken() throws Exception { return authorization.getJSONObject("prepare").getString("token"); }
    String request(String name) throws Exception { return requests.getString(name); }
    String state(String name) throws Exception { return states.getString(name); }
    String storage(String name) throws Exception { return storage.getString(name); }
}
