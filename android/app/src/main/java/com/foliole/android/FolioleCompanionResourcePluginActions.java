package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionResourcePluginActions {
    private FolioleCompanionResourcePluginActions() {}

    static JSObject downloadAttachmentResourceBatch(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.downloadAttachmentResourceBatch(
            call.getData().optJSONArray(
                FolioleCompanionBridgeContractDefinitions.resourceResourcesRequestKey(databaseHelper.hostContext())
            )
        );
    }

    static JSObject commitAttachmentResourceBatch(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.commitAttachmentResourceBatch(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceBatchTokenRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject loadMissingAttachmentResources(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.loadMissingAttachmentResources(
            call.getInt(
                FolioleCompanionBridgeContractDefinitions.resourceLimitRequestKey(context),
                FolioleCompanionBridgeContractDefinitions.resourceMissingResourceLimitDefault(context)
            )
        );
    }

    static JSObject loadMissingAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadMissingAttachmentResource(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject loadMissingContentBlobHashes(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.loadMissingContentBlobHashes(
            call.getInt(
                FolioleCompanionBridgeContractDefinitions.resourceLimitRequestKey(context),
                FolioleCompanionBridgeContractDefinitions.resourceMissingResourceLimitDefault(context)
            )
        );
    }

    static JSObject downloadContentBlobBatch(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.downloadContentBlobBatch(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)),
            call.getData().optJSONObject(FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceBodyRequestKey(context))
        );
    }

    static JSObject commitContentBlobBatch(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.commitContentBlobBatch(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceBatchTokenRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject resolveAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.resolveAttachmentResource(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject loadPdfPageText(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadPdfPageText(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject searchPdfPageText(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.searchPdfPageText(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceQueryRequestKey(context)),
            call.getInt(
                FolioleCompanionBridgeContractDefinitions.resourceLimitRequestKey(context),
                FolioleCompanionBridgeContractDefinitions.resourcePdfPageTextSearchLimitDefault(context)
            )
        );
    }

    static JSObject searchTopics(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.searchTopics(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceQueryRequestKey(context)),
            call.getInt(
                FolioleCompanionBridgeContractDefinitions.resourceLimitRequestKey(context),
                FolioleCompanionBridgeContractDefinitions.resourceTopicSearchLimitDefault(context)
            )
        );
    }

    static JSObject loadExternalDocument(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadExternalDocument(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceDocumentIdRequestKey(databaseHelper.hostContext()))
        );
    }

    static JSObject searchExternalDocuments(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.searchExternalDocuments(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceQueryRequestKey(context)),
            call.getInt(
                FolioleCompanionBridgeContractDefinitions.resourceLimitRequestKey(context),
                FolioleCompanionBridgeContractDefinitions.resourceExternalDocumentSearchLimitDefault(context)
            )
        );
    }
}
