package com.foliole.android;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupLibraryFacts {
    private static final String[] COUNT_KEYS = {
        "node_count", "review_log_count", "attachment_count", "content_blob_count"
    };

    private FolioleCompanionSyncGroupLibraryFacts() {}

    static boolean valid(JSONObject facts) {
        if (facts == null || !facts.has("timeline_id")) return false;
        for (String key : COUNT_KEYS) {
            Object value = facts.opt(key);
            if (!(value instanceof Number) || ((Number) value).longValue() < 0 ||
                ((Number) value).doubleValue() != ((Number) value).longValue()) return false;
        }
        Object timeline = facts.opt("timeline_id");
        return timeline == JSONObject.NULL || timeline instanceof String;
    }
}
