package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncGroupAuthorizationPluginActions {
    private FolioleCompanionSyncGroupAuthorizationPluginActions() {}

    static JSObject createJoinIntentKey(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract = contract(context, call);
        String publicKey = FolioleCompanionSyncGroupLifecycleKeyStore.create(
            context, required(call, contract, "requestId"));
        return new JSObject().put("public_key", publicKey);
    }

    static JSObject discardJoinIntentKey(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract = contract(context, call);
        boolean discarded = FolioleCompanionSyncGroupLifecycleKeyStore.remove(
            context, required(call, contract, "requestId"));
        return new JSObject().put("discarded", discarded);
    }

    static JSObject consumeGrant(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract = contract(context, call);
        String requestId = required(call, contract, "requestId");
        FolioleCompanionSyncGroupAuthorizationStore store =
            FolioleCompanionSyncGroupAuthorizationAndroidStore.member(context);
        FolioleCompanionSyncGroupAuthorizationRecord existing = store.load(required(call, contract, "routeId"));
        if (existing != null) {
            requireMatchingGrant(call, contract, existing);
            FolioleCompanionSyncGroupLifecycleKeyStore.remove(context, requestId);
            return new JSObject().put("route", state(contract, existing)).put("status", "consumed");
        }
        org.json.JSONObject encrypted = call.getObject(contract.request("encryptedRouteSecret"));
        if (encrypted == null) throw new IllegalArgumentException("encryptedRouteSecret is required");
        String secret = FolioleCompanionSyncGroupLifecycleKeyStore.decrypt(context, requestId, encrypted);
        FolioleCompanionSyncGroupAuthorizationRecord record = record(call, contract, secret);
        store.save(record);
        FolioleCompanionSyncGroupLifecycleKeyStore.remove(context, requestId);
        return new JSObject().put("route", state(contract, record)).put("status", "consumed");
    }

    private static void requireMatchingGrant(
        PluginCall call, FolioleCompanionSyncGroupAuthorizationContract contract,
        FolioleCompanionSyncGroupAuthorizationRecord record
    ) throws Exception {
        boolean matches = record.authorizationEpoch == requiredInt(call, contract, "authorizationEpoch") &&
            record.authorizationId.equals(required(call, contract, "authorizationId")) &&
            record.groupId.equals(required(call, contract, "groupId")) &&
            record.localMemberId.equals(required(call, contract, "localMemberId")) &&
            record.peerMemberId.equals(required(call, contract, "peerMemberId"));
        if (!matches) throw new SecurityException("route_grant_conflict");
    }

    static JSObject migrate(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract = contract(context, call);
        String authorizationId = required(call, contract, "authorizationId");
        if (!authorizationId.equals(FolioleCompanionPairingStore.migrationAuthorizationId(context))) {
            throw new SecurityException("legacy_pairing_authorization_mismatch");
        }
        FolioleCompanionSyncGroupAuthorizationRecord record = record(call, contract,
            FolioleCompanionPairingStore.migrationCredentialSecret(context));
        FolioleCompanionSyncGroupAuthorizationAndroidStore.member(context).save(record);
        return new JSObject().put("route", state(contract, record)).put("status", "migrated");
    }

    static JSObject load(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract = contract(context, call);
        FolioleCompanionSyncGroupAuthorizationRecord record =
            FolioleCompanionSyncGroupAuthorizationAndroidStore.member(context).load(required(call, contract, "routeId"));
        return new JSObject().put("route", record == null ? JSONObjectNull.VALUE : state(contract, record));
    }

    static JSObject revoke(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract = contract(context, call);
        boolean revoked = FolioleCompanionSyncGroupAuthorizationAndroidStore.member(context)
            .revoke(required(call, contract, "routeId"));
        return new JSObject().put("revoked", revoked);
    }

    static JSObject sign(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract = contract(context, call);
        String routeId = required(call, contract, "routeId");
        FolioleCompanionSyncGroupAuthorizationRecord record =
            FolioleCompanionSyncGroupAuthorizationAndroidStore.member(context).load(routeId);
        if (record == null) throw new SecurityException("sync_group_route_not_active");
        String timestamp = required(call, contract, "timestamp");
        String nonce = required(call, contract, "nonce");
        String signature = FolioleCompanionSyncGroupAuthorizationAndroidStore.member(context).sign(
            routeId, required(call, contract, "method"), required(call, contract, "pathWithQuery"),
            timestamp, nonce, required(call, contract, "bodyHash"));
        JSObject headers = new JSObject()
            .put(contract.header("authorizationEpoch"), String.valueOf(record.authorizationEpoch))
            .put(contract.header("authorizationId"), record.authorizationId)
            .put(contract.header("groupId"), record.groupId)
            .put(contract.header("localMemberId"), record.localMemberId)
            .put(contract.header("nonce"), nonce)
            .put(contract.header("peerMemberId"), record.peerMemberId)
            .put(contract.header("routeId"), record.routeId)
            .put(contract.header("signature"), signature)
            .put(contract.header("timestamp"), timestamp);
        return new JSObject().put("headers", headers);
    }

    private static FolioleCompanionSyncGroupAuthorizationContract contract(Context context, PluginCall call)
        throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract =
            new FolioleCompanionSyncGroupAuthorizationContract(context);
        if (!contract.prepareToken().equals(required(call, contract, "prepareToken"))) {
            throw new SecurityException("sync_group_authorization_prepare_only");
        }
        return contract;
    }

    private static FolioleCompanionSyncGroupAuthorizationRecord record(
        PluginCall call, FolioleCompanionSyncGroupAuthorizationContract contract, String secret
    ) throws Exception {
        return new FolioleCompanionSyncGroupAuthorizationRecord(
            requiredInt(call, contract, "authorizationEpoch"), required(call, contract, "authorizationId"),
            call.getString(contract.request("endpointHint")), required(call, contract, "groupId"), "member",
            required(call, contract, "localMemberId"), required(call, contract, "peerMemberId"),
            requiredInt(call, contract, "protocolVersion"), required(call, contract, "routeId"), secret);
    }

    private static JSObject state(
        FolioleCompanionSyncGroupAuthorizationContract contract,
        FolioleCompanionSyncGroupAuthorizationRecord record
    ) throws Exception {
        return new JSObject().put(contract.state("authorizationEpoch"), record.authorizationEpoch)
            .put(contract.state("authorizationId"), record.authorizationId)
            .put(contract.state("endpointHint"), record.endpointHint)
            .put(contract.state("groupId"), record.groupId).put(contract.state("kind"), record.kind)
            .put(contract.state("localMemberId"), record.localMemberId)
            .put(contract.state("peerMemberId"), record.peerMemberId)
            .put(contract.state("protocolVersion"), record.protocolVersion)
            .put(contract.state("routeId"), record.routeId).put(contract.state("state"), "active");
    }

    private static String required(
        PluginCall call, FolioleCompanionSyncGroupAuthorizationContract contract, String name
    ) throws Exception {
        String value = call.getString(contract.request(name));
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(name + " is required");
        return value.trim();
    }

    private static int requiredInt(
        PluginCall call, FolioleCompanionSyncGroupAuthorizationContract contract, String name
    ) throws Exception {
        Integer value = call.getInt(contract.request(name));
        if (value == null) throw new IllegalArgumentException(name + " is required");
        return value;
    }

    private static final class JSONObjectNull { private static final Object VALUE = org.json.JSONObject.NULL; }
}
