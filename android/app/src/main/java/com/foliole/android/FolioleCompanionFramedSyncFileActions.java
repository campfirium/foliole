package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.FramedSyncFiles;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncFileActions {
    private FolioleCompanionFramedSyncFileActions() {}

    static JSObject access(Context context, PluginCall call) throws Exception {
        FramedSyncPayloadBudget owner = FramedSyncPayloadBudgetRegistry.current();
        if (owner.isClosed() || !owner.libraryKey().equals(call.getString("library_key")) ||
            !owner.generationId().equals(call.getString("generation_id"))) {
            throw new IllegalArgumentException("framed_sync_file_owner_mismatch");
        }
        FramedSyncFiles files = new FramedSyncFiles(context, owner.libraryKey());
        String key = call.getString("key");
        String operation = call.getString("operation", "");
        JSObject result = new JSObject();
        switch (operation) {
            case "read":
                byte[] bytes = files.read(key);
                result.put("base64", bytes == null ? JSONObject.NULL : Base64.encodeToString(bytes, Base64.NO_WRAP));
                break;
            case "write":
                String encoded = call.getString("base64");
                if (encoded == null) throw new IllegalArgumentException("framed_sync_file_bytes_missing");
                files.write(key, Base64.decode(encoded, Base64.NO_WRAP));
                break;
            case "list": result.put("entries", new JSONArray(files.list(key))); break;
            case "remove": files.remove(key); break;
            default: throw new IllegalArgumentException("framed_sync_file_operation_invalid");
        }
        return result;
    }
}
