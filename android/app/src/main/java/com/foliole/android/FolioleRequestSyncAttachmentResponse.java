package com.foliole.android;

import android.util.Base64;
import com.foliole.android.framed.FramedSyncFiles;
import com.foliole.android.framed.FramedSyncSessionContext;
import com.foliole.android.framed.FramedSyncStreamReader;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.RequestSyncAttachmentResponseReader;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.InputStream;

final class FolioleRequestSyncAttachmentResponse {
    private FolioleRequestSyncAttachmentResponse() {}

    static JSObject read(PluginCall call, FramedSyncFiles files, String directory, InputStream input,
        FolioleRequestSyncHttpChunks.Check check, FolioleRequestSyncHttpChunks.Check progress, FramedSyncPayloadBudget owner) throws Exception {
        JSObject options = call.getObject("attachment_response");
        if (options == null || !options.has("max_blocks")) throw new IllegalArgumentException("attachment_response_context_missing");
        var credential = FolioleCompanionCurrentGroupCredential.load(call.getString("sync_group_id"), owner);
        if (!credential.deviceId.equals(options.getString("initiator_device_id"))) {
            throw new SecurityException("attachment_response_initiator_mismatch");
        }
        byte[] groupKey = Base64.decode(credential.workgroupKey, Base64.URL_SAFE | Base64.NO_WRAP);
        FramedSyncSessionContext context = new FramedSyncSessionContext(call.getString("sync_group_id"),
            options.getString("initiator_device_id"), options.getString("initiator_library_epoch"),
            call.getString("receiver_device_id"), call.getString("receiver_library_epoch"));
        JSArray messages = new JSArray();
        byte[] preamble = RequestSyncAttachmentResponseReader.read(new FramedSyncStreamReader(input).budgeted(owner,
            FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD), groupKey, context, options.getInt("max_blocks"), check::run,
            (index, metadata, block) -> {
                check.run(); progress.run();
                String key = block.length == 0 ? "" : directory + "/attachment-" + index;
                if (!key.isEmpty()) files.write(key, block);
                messages.put(new JSObject().put("metadata_base64", Base64.encodeToString(metadata, Base64.NO_WRAP))
                    .put("file_key", key).put("byte_length", block.length));
            });
        return new JSObject().put("response_chunk_count", 0).put("response_byte_length", 0)
            .put("attachment_response", new JSObject().put("preamble_base64", Base64.encodeToString(preamble, Base64.NO_WRAP))
                .put("messages", messages));
    }
}
