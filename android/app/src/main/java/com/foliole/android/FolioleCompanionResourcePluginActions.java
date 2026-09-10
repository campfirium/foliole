package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionResourcePluginActions {
    private FolioleCompanionResourcePluginActions() {}

    static JSObject downloadAttachmentResourceBatch(Context context, PluginCall call) throws Exception {
        return FolioleCompanionAttachmentResourceBatchStore.downloadResources(
            context, call.getData().optJSONArray(
                FolioleCompanionBridgeContractDefinitions.resourceResourcesRequestKey(context)
            )
        );
    }

    static JSObject stageAttachmentResourceBatch(Context context, PluginCall call) throws Exception {
        return FolioleCompanionAttachmentFileStage.stage(
            context, call.getString(FolioleCompanionBridgeContractDefinitions.resourceBatchTokenRequestKey(context))
        );
    }

    static JSObject finishAttachmentResourceBatch(Context context, PluginCall call) throws Exception {
        FolioleCompanionAttachmentFileStage.finish(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceBatchTokenRequestKey(context)),
            call.getBoolean(FolioleCompanionBridgeContractDefinitions.resourceCommittedRequestKey(context), false)
        );
        return new JSObject();
    }

    static JSObject downloadContentBlobBatch(Context context, PluginCall call) throws Exception {
        return FolioleCompanionContentBlobBatchStore.downloadBlobs(
            context,
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)),
            call.getData().optJSONObject(FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceBodyRequestKey(context))
        );
    }

    static JSObject finishContentBlobBatch(Context context, PluginCall call) throws Exception {
        FolioleCompanionContentBlobBatchSessions.finish(
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceBatchTokenRequestKey(context))
        );
        return new JSObject();
    }

    static JSObject resolveAttachmentResource(Context context, PluginCall call) throws Exception {
        return FolioleCompanionAttachmentFileResolver.resolve(
            context,
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceMimeTypeRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceStorageKeyRequestKey(context))
        );
    }
}
