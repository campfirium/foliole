package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionLearningSyncPayload {
    private FolioleCompanionLearningSyncPayload() {}

    static void applyReading(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        String queryName = FolioleCompanionSyncPayloadQueryStore.nodeReadingPayloadQueryName();
        if (FolioleCompanionLearningPayloadRules.isDeleted(context, record, queryName)) {
            FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "readingDeleteMutationName"), new Object[] { objectId });
            FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "readingDeviceStateDeleteMutationName"), new Object[] { objectId });
            return;
        }
        JSONObject payload = payload(context, record);
        String updatedAt = FolioleCompanionLearningPayloadRules.updatedAt(context, record, queryName);
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "readingUpsertMutationName"), new Object[] {
            objectId,
            FolioleCompanionLearningPayloadRules.longValue(context, payload, queryName, "intervalDurationMsPayloadKey", "defaultIntervalDurationMs"),
            FolioleCompanionLearningPayloadRules.doubleValue(context, payload, queryName, "intervalGrowthFactorPayloadKey", "defaultIntervalGrowthFactor"),
            FolioleCompanionLearningPayloadRules.string(context, payload, queryName, "lastHandledAtPayloadKey", updatedAt),
            FolioleCompanionLearningPayloadRules.string(context, payload, queryName, "nextAtPayloadKey", updatedAt),
            FolioleCompanionLearningPayloadRules.doubleValue(context, payload, queryName, "priorityPayloadKey", "defaultPriority"),
            FolioleCompanionLearningPayloadRules.intValue(context, payload, queryName, "repetitionCountPayloadKey", "defaultRepetitionCount"),
            FolioleCompanionLearningPayloadRules.string(context, payload, queryName, "statePayloadKey", defaultReadingState(context))
        });
        if (FolioleCompanionLearningPayloadRules.has(context, payload, queryName, "readingPositionPayloadKey")) {
            FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "readingDeviceStateUpsertMutationName"), new Object[] {
                objectId,
                FolioleCompanionLearningPayloadRules.string(context, payload, queryName, "deviceIdPayloadKey", defaultReadingDeviceId(context)),
                FolioleCompanionLearningPayloadRules.longValue(context, payload, queryName, "readingPositionPayloadKey", "defaultReadingPosition"),
                updatedAt
            });
        }
    }

    static void applyReview(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        String queryName = FolioleCompanionSyncPayloadQueryStore.nodeReviewPayloadQueryName();
        if (FolioleCompanionLearningPayloadRules.isDeleted(context, record, queryName)) {
            FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "reviewDeleteMutationName"), new Object[] { objectId });
            return;
        }
        JSONObject payload = payload(context, record);
        String updatedAt = FolioleCompanionLearningPayloadRules.updatedAt(context, record, queryName);
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "reviewUpsertMutationName"), new Object[] {
            objectId,
            FolioleCompanionLearningPayloadRules.string(context, payload, queryName, "duePayloadKey", updatedAt),
            nullIfEmpty(FolioleCompanionLearningPayloadRules.string(context, payload, queryName, "lastReviewAtPayloadKey", "")),
            FolioleCompanionLearningPayloadRules.intValue(context, payload, queryName, "statePayloadKey", "defaultState"),
            FolioleCompanionLearningPayloadRules.doubleValue(context, payload, queryName, "stabilityPayloadKey", "defaultStability"),
            FolioleCompanionLearningPayloadRules.doubleValue(context, payload, queryName, "difficultyPayloadKey", "defaultDifficulty"),
            FolioleCompanionLearningPayloadRules.intValue(context, payload, queryName, "elapsedDaysPayloadKey", "defaultElapsedDays"),
            FolioleCompanionLearningPayloadRules.intValue(context, payload, queryName, "scheduledDaysPayloadKey", "defaultScheduledDays"),
            FolioleCompanionLearningPayloadRules.intValue(context, payload, queryName, "repsPayloadKey", "defaultReps"),
            FolioleCompanionLearningPayloadRules.intValue(context, payload, queryName, "lapsesPayloadKey", "defaultLapses")
        });
    }

    private static String defaultReadingState(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(
            context,
            FolioleCompanionSyncPayloadQueryStore.nodeReadingPayloadQueryName(),
            "defaultState"
        );
    }

    private static String defaultReadingDeviceId(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(
            context,
            FolioleCompanionSyncPayloadQueryStore.nodeReadingPayloadQueryName(),
            "defaultDeviceId"
        );
    }

    private static JSONObject payload(Context context, JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(context, record);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionSyncApplyMutationRules.string(context, "learning", key);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
