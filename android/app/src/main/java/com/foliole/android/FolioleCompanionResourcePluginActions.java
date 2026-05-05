package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionResourcePluginActions {
    private FolioleCompanionResourcePluginActions() {}

    static JSObject syncAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.syncAttachmentResource(
            call.getString("attachment_id"),
            call.getString("content_hash"),
            call.getString("url"),
            call.getData().optJSONObject("headers")
        );
    }

    static JSObject syncAttachmentResources(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.syncAttachmentResources(call.getData().optJSONArray("resources"));
    }

    static JSObject loadMissingAttachmentResources(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) {
        return databaseHelper.loadMissingAttachmentResources(call.getInt("limit", 50));
    }

    static JSObject loadMissingAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) {
        return databaseHelper.loadMissingAttachmentResource(call.getString("attachment_id"));
    }

    static JSObject loadMissingContentBlobHashes(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadMissingContentBlobHashes(call.getInt("limit", 50));
    }

    static JSObject syncContentBlob(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.syncContentBlob(
            call.getString("hash"),
            call.getString("url"),
            call.getData().optJSONObject("headers")
        );
    }

    static JSObject syncContentBlobs(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.syncContentBlobs(
            call.getString("url"),
            call.getData().optJSONObject("headers"),
            call.getString("body")
        );
    }

    static JSObject resolveAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) {
        return databaseHelper.resolveAttachmentResource(call.getString("attachment_id"));
    }

    static JSObject loadPdfPageText(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadPdfPageText(call.getString("attachment_id"));
    }

    static JSObject searchPdfPageText(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.searchPdfPageText(call.getString("query"), call.getInt("limit", 20));
    }

    static JSObject loadExternalDocument(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) {
        return databaseHelper.loadExternalDocument(call.getString("document_id"));
    }

    static JSObject searchExternalDocuments(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) {
        return databaseHelper.searchExternalDocuments(call.getString("query"), call.getInt("limit", 20));
    }
}
