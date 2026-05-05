package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Set;

final class FolioleCompanionSyncPushAckRules {
    private final JSONArray clientOpIdKeys;
    private final Set<String> confirmingStatuses;
    private final String identityKey;
    private final String identityObjectIdKey;
    private final String identityObjectTypeKey;
    private final String resultSavedClientOpIdsKey;
    private final String stateSeqKey;
    private final Set<String> stateSeqOptionalObjectTypes;
    private final Set<String> stateSeqRejectedObjectTypes;
    private final String statusKey;
    private final Set<String> statuses;

    private FolioleCompanionSyncPushAckRules(JSONObject definitions) throws Exception {
        clientOpIdKeys = pushAckArray(definitions, "clientOpIdKeys");
        confirmingStatuses = pushAckSet(definitions, "confirmingStatuses");
        identityKey = pushAckString(definitions, "identityKey");
        identityObjectIdKey = pushAckString(definitions, "identityObjectIdKey");
        identityObjectTypeKey = pushAckString(definitions, "identityObjectTypeKey");
        resultSavedClientOpIdsKey = pushAckString(definitions, "resultSavedClientOpIdsKey");
        stateSeqKey = pushAckString(definitions, "stateSeqKey");
        stateSeqOptionalObjectTypes = pushAckSet(definitions, "stateSeqOptionalObjectTypes");
        stateSeqRejectedObjectTypes = pushAckSet(definitions, "stateSeqRejectedObjectTypes");
        statusKey = pushAckString(definitions, "statusKey");
        statuses = pushAckSet(definitions, "statuses");
    }

    static FolioleCompanionSyncPushAckRules load(Context context) throws Exception {
        return new FolioleCompanionSyncPushAckRules(FolioleCompanionSyncProtocolDefinitions.load(context));
    }

    boolean isKnownStatus(JSONObject ack) {
        return statuses.contains(status(ack));
    }

    boolean hasRequiredFields(JSONObject ack, JSONObject identity) {
        if (identity == null) return false;
        String clientOpId = clientOpId(ack);
        String objectType = objectType(identity);
        String objectId = objectId(identity);
        String status = status(ack);
        boolean canConfirm = confirmingStatuses.contains(status);
        if (canConfirm && stateSeqRejectedObjectTypes.contains(objectType)) return false;
        if (canConfirm && stateSeqOptionalObjectTypes.contains(objectType)) return hasIdentity(clientOpId, objectId);
        return hasIdentity(clientOpId, objectId) &&
            !objectType.isEmpty() &&
            (!canConfirm || hasStateSeq(ack));
    }

    JSONObject identity(JSONObject ack) {
        return ack.optJSONObject(identityKey);
    }

    String clientOpId(JSONObject ack) {
        for (int index = 0; index < clientOpIdKeys.length(); index += 1) {
            String value = ack.optString(clientOpIdKeys.optString(index), "").trim();
            if (!value.isEmpty()) return value;
        }
        return "";
    }

    String objectType(JSONObject identity) {
        return identity.optString(identityObjectTypeKey).trim();
    }

    String objectId(JSONObject identity) {
        return identity.optString(identityObjectIdKey).trim();
    }

    Long stateSeq(JSONObject ack) {
        return hasStateSeq(ack) ? ack.optLong(stateSeqKey) : null;
    }

    String status(JSONObject ack) {
        return ack.optString(statusKey).trim();
    }

    String resultSavedClientOpIdsKey() {
        return resultSavedClientOpIdsKey;
    }

    private boolean hasStateSeq(JSONObject ack) {
        return ack.has(stateSeqKey) && !ack.isNull(stateSeqKey);
    }

    private static JSONArray pushAckArray(JSONObject definitions, String key) throws Exception {
        return pushAck(definitions).getJSONArray(key);
    }

    private static Set<String> pushAckSet(JSONObject definitions, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringSet(pushAck(definitions), key);
    }

    private static String pushAckString(JSONObject definitions, String key) throws Exception {
        return pushAck(definitions).getString(key);
    }

    private static JSONObject pushAck(JSONObject definitions) throws Exception {
        return definitions.getJSONObject("pushAck");
    }

    private static boolean hasIdentity(String clientOpId, String objectId) {
        return !clientOpId.isEmpty() && !objectId.isEmpty();
    }
}
