package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionDocumentSyncPayload {

    private FolioleCompanionDocumentSyncPayload() {}

    static void apply(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull(recordKey(context, "recordDeletedAtKey"))) {
            FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "markMissingMutationName"), new Object[] {
                FolioleCompanionDocumentPayloadRules.deletedAt(context, record),
                FolioleCompanionDocumentPayloadRules.updatedAt(context, record),
                objectId
            });
            return;
        }
        JSONObject payload = payload(record);
        FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "upsertMutationName"), new Object[] {
            objectId,
            filePart(context, payload, "folderIdPayloadKey"),
            filePart(context, payload, "relativePathPayloadKey"),
            filePart(context, payload, "fileNamePayloadKey"),
            filePart(context, payload, "extensionPayloadKey"),
            FolioleCompanionDocumentPayloadRules.longValue(context, payload, "sourceSizeBytesPayloadKey"),
            string(context, payload, "sourceModifiedAtPayloadKey", FolioleCompanionDocumentPayloadRules.updatedAt(context, record)),
            FolioleCompanionDocumentPayloadRules.longValue(context, payload, "sourceModifiedMsPayloadKey"),
            FolioleCompanionDocumentPayloadRules.contentHash(context, payload, record),
            FolioleCompanionDocumentPayloadRules.nullableString(context, payload, "titlePayloadKey"),
            FolioleCompanionDocumentPayloadRules.nullableString(context, payload, "openingTextPayloadKey"),
            FolioleCompanionDocumentPayloadRules.nullableString(context, payload, "bodyBlobHashPayloadKey"),
            string(context, payload, "contentPayloadKey", documentDefault(context, "defaultContent")),
            string(context, payload, "indexedAtPayloadKey", FolioleCompanionDocumentPayloadRules.updatedAt(context, record)),
            FolioleCompanionDocumentPayloadRules.isPresent(context, payload),
            FolioleCompanionDocumentPayloadRules.nullableString(context, payload, "missingAtPayloadKey"),
            string(context, payload, "createdAtPayloadKey", FolioleCompanionDocumentPayloadRules.updatedAt(context, record)),
            FolioleCompanionDocumentPayloadRules.updatedAt(context, record)
        });
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(record);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionSyncApplyMutationRules.string(context, "documents", key);
    }

    private static String filePart(Context context, JSONObject payload, String keyName) throws Exception {
        return FolioleCompanionDocumentPayloadRules.filePart(context, payload, keyName);
    }

    private static String string(Context context, JSONObject payload, String keyName, String fallback) throws Exception {
        return FolioleCompanionDocumentPayloadRules.string(context, payload, keyName, fallback);
    }

    private static String documentDefault(Context context, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(
            context,
            FolioleCompanionSyncPayloadQueryStore.EXTERNAL_DOCUMENT_PAYLOAD_QUERY_NAME,
            key
        );
    }

    private static String recordKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(
            context,
            FolioleCompanionSyncPayloadQueryStore.EXTERNAL_DOCUMENT_PAYLOAD_QUERY_NAME,
            key
        );
    }
}
