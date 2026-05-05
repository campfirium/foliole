package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.util.Set;

final class FolioleCompanionSyncPushAckRules {
    private final Set<String> confirmingStatuses;
    private final Set<String> stateSeqOptionalObjectTypes;
    private final Set<String> stateSeqRejectedObjectTypes;
    private final Set<String> statuses;

    private FolioleCompanionSyncPushAckRules(JSONObject definitions) throws Exception {
        JSONObject pushAck = definitions.getJSONObject("pushAck");
        confirmingStatuses = FolioleCompanionSyncProtocolDefinitions.stringSet(pushAck, "confirmingStatuses");
        stateSeqOptionalObjectTypes = FolioleCompanionSyncProtocolDefinitions.stringSet(pushAck, "stateSeqOptionalObjectTypes");
        stateSeqRejectedObjectTypes = FolioleCompanionSyncProtocolDefinitions.stringSet(pushAck, "stateSeqRejectedObjectTypes");
        statuses = FolioleCompanionSyncProtocolDefinitions.stringSet(pushAck, "statuses");
    }

    static FolioleCompanionSyncPushAckRules load(Context context) throws Exception {
        return new FolioleCompanionSyncPushAckRules(FolioleCompanionSyncProtocolDefinitions.load(context));
    }

    boolean isKnownStatus(JSONObject ack) {
        return statuses.contains(ack.optString("status"));
    }

    boolean hasRequiredFields(JSONObject ack, JSONObject identity) {
        if (identity == null) return false;
        String clientOpId = ack.optString("client_op_id", ack.optString("clientOpId")).trim();
        String objectType = identity.optString("objectType").trim();
        String objectId = identity.optString("objectId").trim();
        String status = ack.optString("status");
        boolean canConfirm = confirmingStatuses.contains(status);
        if (canConfirm && stateSeqRejectedObjectTypes.contains(objectType)) return false;
        if (canConfirm && stateSeqOptionalObjectTypes.contains(objectType)) return hasIdentity(clientOpId, objectId);
        return hasIdentity(clientOpId, objectId) &&
            !objectType.isEmpty() &&
            (!canConfirm || (ack.has("state_seq") && !ack.isNull("state_seq")));
    }

    private static boolean hasIdentity(String clientOpId, String objectId) {
        return !clientOpId.isEmpty() && !objectId.isEmpty();
    }
}
