package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionLearningPayloadStore {
    private static final String NODE_READING_PAYLOAD_QUERY_NAME = "syncPayloadNodeReading";
    private static final String NODE_REVIEW_PAYLOAD_QUERY_NAME = "syncPayloadNodeReview";

    private FolioleCompanionLearningPayloadStore() {}

    static String nodeReadingPayloadQueryName() {
        return NODE_READING_PAYLOAD_QUERY_NAME;
    }

    static String nodeReviewPayloadQueryName() {
        return NODE_REVIEW_PAYLOAD_QUERY_NAME;
    }

    static boolean owns(String queryName) {
        return queryName.equals(NODE_READING_PAYLOAD_QUERY_NAME) || queryName.equals(NODE_REVIEW_PAYLOAD_QUERY_NAME);
    }

    static String loadPayload(Context context, SQLiteDatabase database, String queryName, String[] args) throws Exception {
        JSONObject payload = FolioleCompanionNamedQueryStore.loadFirstRow(context, database, queryName, args);
        return payload == null ? "{}" : payload.toString();
    }
}
