package com.foliole.android;

import com.foliole.sync.v22.TransferHeader;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;

/** Bind an authenticated header to the complete original requested source, before staging admission. */
final class FolioleCompanionFramedSyncRequestedFacts {
    private FolioleCompanionFramedSyncRequestedFacts() {}

    static void require(FolioleCompanionFramedSyncPullInput.Request request, TransferHeader header) throws Exception {
        Set<String> expected = new HashSet<>();
        add(expected, 1, request.stateFactIds);
        Set<String> versions = new HashSet<>(request.frontierFactIds);
        if (request.objectType.equals("node")) {
            for (String relation : request.requiredRelationIds) {
                JSONArray value = new JSONArray(relation);
                Object ordinal = value.length() == 3 ? value.get(2) : null;
                if (value.length() != 3 || !(value.get(0) instanceof String) ||
                    !(value.get(1) instanceof String) || !(ordinal instanceof Number) ||
                    ((Number) ordinal).doubleValue() < 0 ||
                    ((Number) ordinal).doubleValue() > 9007199254740991d ||
                    ((Number) ordinal).doubleValue() != ((Number) ordinal).longValue() ||
                    value.getString(0).isEmpty() || value.getString(1).isEmpty()) {
                    throw invalid();
                }
                versions.add(value.getString(0)); versions.add(value.getString(1));
            }
            add(expected, 2, List.copyOf(versions));
        }
        add(expected, 3, request.requiredRelationIds);
        add(expected, 4, request.reviewFactIds);
        if (header.getManifest().getFactsCount() != expected.size()) throw invalid();
        for (var descriptor : header.getManifest().getFactsList()) {
            var fact = descriptor.getIdentity();
            if (!request.objectId.equals(fact.getGlobalId()) || !request.objectType.equals(fact.getObjectType()) ||
                !expected.remove(fact.getKindValue() + "\u0000" + fact.getFactId())) throw invalid();
        }
        if (!expected.isEmpty()) throw invalid();
    }

    private static void add(Set<String> expected, int kind, List<String> ids) {
        for (String id : ids) if (!expected.add(kind + "\u0000" + id)) throw invalid();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("framed_sync_requested_fact_set_mismatch");
    }
}
