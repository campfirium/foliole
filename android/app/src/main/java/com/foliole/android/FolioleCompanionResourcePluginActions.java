package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionResourcePluginActions {
    private FolioleCompanionResourcePluginActions() {}

    static JSObject syncAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.syncAttachmentResource(
            call.getString(requestKey(context, "attachmentId")),
            call.getString(requestKey(context, "contentHash")),
            call.getString(requestKey(context, "url")),
            call.getData().optJSONObject(requestKey(context, "headers"))
        );
    }

    static JSObject syncAttachmentResources(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.syncAttachmentResources(
            call.getData().optJSONArray(requestKey(databaseHelper.hostContext(), "resources"))
        );
    }

    static JSObject loadMissingAttachmentResources(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.loadMissingAttachmentResources(
            call.getInt(requestKey(context, "limit"), defaultLimit(context, "missingResourceLimit"))
        );
    }

    static JSObject loadMissingAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadMissingAttachmentResource(
            call.getString(requestKey(databaseHelper.hostContext(), "attachmentId"))
        );
    }

    static JSObject loadMissingContentBlobHashes(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.loadMissingContentBlobHashes(
            call.getInt(requestKey(context, "limit"), defaultLimit(context, "missingResourceLimit"))
        );
    }

    static JSObject syncContentBlob(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.syncContentBlob(
            call.getString(requestKey(context, "hash")),
            call.getString(requestKey(context, "url")),
            call.getData().optJSONObject(requestKey(context, "headers"))
        );
    }

    static JSObject syncContentBlobs(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.syncContentBlobs(
            call.getString(requestKey(context, "url")),
            call.getData().optJSONObject(requestKey(context, "headers")),
            call.getString(requestKey(context, "body"))
        );
    }

    static JSObject resolveAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.resolveAttachmentResource(
            call.getString(requestKey(databaseHelper.hostContext(), "attachmentId"))
        );
    }

    static JSObject loadPdfPageText(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadPdfPageText(call.getString(requestKey(databaseHelper.hostContext(), "attachmentId")));
    }

    static JSObject searchPdfPageText(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.searchPdfPageText(
            call.getString(requestKey(context, "query")),
            call.getInt(requestKey(context, "limit"), defaultLimit(context, "pdfPageTextSearchLimit"))
        );
    }

    static JSObject loadExternalDocument(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadExternalDocument(call.getString(requestKey(databaseHelper.hostContext(), "documentId")));
    }

    static JSObject searchExternalDocuments(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.searchExternalDocuments(
            call.getString(requestKey(context, "query")),
            call.getInt(requestKey(context, "limit"), defaultLimit(context, "externalDocumentSearchLimit"))
        );
    }

    private static int defaultLimit(android.content.Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.resourceDefault(context, key);
    }

    private static String requestKey(android.content.Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.resourceRequestKey(context, key);
    }
}
