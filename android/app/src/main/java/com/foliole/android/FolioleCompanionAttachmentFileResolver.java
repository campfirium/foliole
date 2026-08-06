package com.foliole.android;

import android.content.Context;
import android.net.Uri;

import com.getcapacitor.JSObject;

import java.io.File;

final class FolioleCompanionAttachmentFileResolver {
    private FolioleCompanionAttachmentFileResolver() {}

    static JSObject resolve(Context context, String mimeType, String storageKey) throws Exception {
        File file = storageKey == null || storageKey.trim().isEmpty()
            ? null
            : new File(new File(context.getFilesDir(), "attachments"), storageKey.trim());
        boolean ready = file != null && file.isFile();
        JSObject result = new JSObject();
        result.put(responseKey(context, "status"), status(context, ready ? "readyStatusKey" : "missingFile"));
        result.put(responseKey(context, "mimeType"), mimeType);
        result.put(responseKey(context, "resourceUrl"), ready ? Uri.fromFile(file).toString() : null);
        return result;
    }

    private static String responseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentResolveResponseKey(context, key);
    }

    private static String status(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentResolveStatus(context, key);
    }
}
