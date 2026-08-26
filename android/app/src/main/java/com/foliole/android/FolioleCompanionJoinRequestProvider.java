package com.foliole.android;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

final class FolioleCompanionJoinRequestProvider {
    private static final Pattern BASE64_URL = Pattern.compile("^[A-Za-z0-9_-]+$");
    private final JSONObject groupInfo;
    private final Map<String, FolioleCompanionJoinRequest> requests = new LinkedHashMap<>();

    FolioleCompanionJoinRequestProvider(JSONObject value) throws Exception {
        if (value.length() != 3 || !value.has("display_name") || !value.has("group_id") || !value.has("workgroup_key")) {
            throw new IllegalArgumentException("sync_group_join_group_info_invalid");
        }
        required(value, "display_name"); required(value, "group_id");
        String encodedGroupKey = required(value, "workgroup_key");
        if (!BASE64_URL.matcher(encodedGroupKey).matches()) {
            throw new IllegalArgumentException("workgroup_key_invalid");
        }
        byte[] groupKey = android.util.Base64.decode(encodedGroupKey,
            android.util.Base64.URL_SAFE | android.util.Base64.NO_PADDING | android.util.Base64.NO_WRAP);
        if (groupKey.length != 32) throw new IllegalArgumentException("workgroup_key_invalid");
        groupInfo = new JSONObject(value.toString());
    }

    synchronized JSObject receive(JSONObject input, long nowMs) throws Exception {
        prune(nowMs);
        FolioleCompanionJoinRequest request = new FolioleCompanionJoinRequest(input, nowMs);
        if (!groupInfo.getString("group_id").equals(request.groupId)) {
            throw new IllegalArgumentException("sync_group_identity_mismatch");
        }
        requests.put(request.requestId, request);
        return new JSObject(request.publicJson().toString());
    }

    synchronized JSArray pending(long nowMs) throws Exception {
        prune(nowMs);
        JSArray result = new JSArray();
        for (FolioleCompanionJoinRequest request : requests.values()) {
            if (request.acceptance == null) result.put(request.publicJson());
        }
        return result;
    }

    synchronized JSObject accept(String requestId, long nowMs) throws Exception {
        FolioleCompanionJoinRequest request = requirePending(requestId, nowMs);
        request.acceptance = new JSONObject()
            .put("encrypted_group_info", FolioleCompanionSyncGroupPairCrypto.encrypt(
                request.publicKey, groupInfo.toString()
            ))
            .put("expires_at", request.expiresAt)
            .put("request_id", request.requestId);
        return new JSObject(request.acceptance.toString());
    }

    synchronized JSObject collect(String requestId, long nowMs) throws Exception {
        prune(nowMs);
        FolioleCompanionJoinRequest request = requests.get(requestId);
        if (request == null || request.acceptance == null) return null;
        requests.remove(requestId);
        return new JSObject(request.acceptance.toString());
    }

    synchronized boolean reject(String requestId, long nowMs) {
        prune(nowMs);
        return requests.remove(requestId) != null;
    }

    synchronized void clear() { requests.clear(); }

    private FolioleCompanionJoinRequest requirePending(String requestId, long nowMs) {
        prune(nowMs);
        FolioleCompanionJoinRequest request = requests.get(requestId);
        if (request == null) throw new IllegalArgumentException("sync_group_join_request_not_found");
        if (request.acceptance != null) throw new IllegalStateException("sync_group_join_request_already_accepted");
        return request;
    }

    private void prune(long nowMs) {
        requests.entrySet().removeIf(entry -> entry.getValue().expired(nowMs));
    }

    private static String required(JSONObject value, String key) {
        Object raw = value.opt(key);
        if (!(raw instanceof String)) throw new IllegalArgumentException(key + "_invalid");
        String result = (String) raw;
        if (result.isEmpty() || !result.equals(result.trim()) || result.indexOf('\0') >= 0) {
            throw new IllegalArgumentException(key + "_invalid");
        }
        return result;
    }
}
