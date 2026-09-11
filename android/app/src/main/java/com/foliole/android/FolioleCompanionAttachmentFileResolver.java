package com.foliole.android;

import android.content.Context;
import android.net.Uri;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;

import com.getcapacitor.JSObject;

import java.io.File;

final class FolioleCompanionAttachmentFileResolver {
    private FolioleCompanionAttachmentFileResolver() {}

    static JSObject resolve(Context context, String contentHash, String mimeType, String storageKey) throws Exception {
        File file = !FolioleCompanionCanonicalAttachmentKey.matches(contentHash, mimeType, storageKey)
            ? null
            : new File(new File(context.getFilesDir(), "attachments"), storageKey.trim());
        boolean ready = isRegularFileWithoutFollowingLinks(file) &&
            contentHash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, file));
        JSObject result = new JSObject();
        result.put(responseKey(context, "status"), status(context, ready ? "readyStatusKey" : "missingFile"));
        result.put(responseKey(context, "mimeType"), mimeType);
        result.put(responseKey(context, "resourceUrl"), ready ? Uri.fromFile(file).toString() : null);
        return result;
    }

    private static boolean isRegularFileWithoutFollowingLinks(File file) {
        if (file == null) return false;
        try {
            return OsConstants.S_ISREG(Os.lstat(file.getAbsolutePath()).st_mode);
        } catch (ErrnoException error) {
            return false;
        }
    }

    private static String responseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentResolveResponseKey(context, key);
    }

    private static String status(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentResolveStatus(context, key);
    }
}
