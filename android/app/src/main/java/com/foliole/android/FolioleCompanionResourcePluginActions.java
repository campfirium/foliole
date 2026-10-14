package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionResourcePluginActions {
    private FolioleCompanionResourcePluginActions() {}

    static JSObject resolveAttachmentResource(Context context, PluginCall call) throws Exception {
        return FolioleCompanionAttachmentFileResolver.resolve(
            context,
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceContentHashRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceMimeTypeRequestKey(context)),
            call.getString(FolioleCompanionBridgeContractDefinitions.resourceStorageKeyRequestKey(context))
        );
    }
}
