package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionResourcePluginActions {
    private FolioleCompanionResourcePluginActions() {}

    static JSObject syncAttachmentResource(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.syncAttachmentResource(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceContentHashRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)),
            call.getData().optJSONObject(FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context))
        );
    }

    static JSObject syncAttachmentResources(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.syncAttachmentResources(
            call.getData().optJSONArray(
                FolioleCompanionBridgeContractDefinitions.resourceResourcesRequestKey(databaseHelper.hostContext())
            )
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

    static JSObject syncContentBlob(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.syncContentBlob(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceHashRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)),
            call.getData().optJSONObject(FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context))
        );
    }

    static JSObject syncContentBlobs(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        android.content.Context context = databaseHelper.hostContext();
        return databaseHelper.syncContentBlobs(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)),
            call.getData().optJSONObject(FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceBodyRequestKey(context))
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
