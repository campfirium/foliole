package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.AttachmentReceiveAuthorization;
import com.foliole.android.framed.FramedSyncSessionContext;
import com.foliole.android.framed.FramedSyncStreamReader;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.RequestSyncAttachmentResponseReader;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.InputStream;

final class FolioleRequestSyncAttachmentResponse {
    private FolioleRequestSyncAttachmentResponse() {}
    static JSObject read(Context app, PluginCall call, InputStream input, FolioleRequestSyncHttpChunks.Check check,
        FolioleRequestSyncHttpChunks.Check progress, FramedSyncPayloadBudget owner) throws Exception {
        JSObject options = call.getObject("attachment_receive");
        var permission = new AttachmentReceiveAuthorization(Base64.decode(options.getString("request_id_base64"), Base64.NO_WRAP),
            options.getString("storage_key"), options.getLong("byte_length"), options.getLong("offset"), options.getInt("max_blocks"));
        var credential = FolioleCompanionCurrentGroupCredential.load(call.getString("sync_group_id"), owner);
        if (!credential.deviceId.equals(options.getString("initiator_device_id"))) throw new SecurityException("attachment_response_initiator_mismatch");
        byte[] key = Base64.decode(credential.workgroupKey, Base64.URL_SAFE | Base64.NO_WRAP);
        var context = new FramedSyncSessionContext(call.getString("sync_group_id"), options.getString("initiator_device_id"),
            options.getString("initiator_library_epoch"), call.getString("receiver_device_id"), call.getString("receiver_library_epoch"));
        long[] touched = { 0 };
        try (var file = FolioleAttachmentBlockFiles.receive(app, owner, permission.storageKey, permission.start)) {
            RequestSyncAttachmentResponseReader.read(new FramedSyncStreamReader(input).budgeted(owner,
                FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD), key, context, permission, check::run,
                (offset, block) -> {
                    check.run(); file.append(offset, block);
                    long now = System.nanoTime();
                    if (touched[0] == 0 || now - touched[0] >= 250_000_000L) { progress.run(); touched[0] = now; }
                });
        }
        return new JSObject().put("response_chunk_count", 0).put("response_byte_length", 0).put("attachment_receive",
            new JSObject().put("offset", permission.offset()).put("blocks", permission.blocks()).put("pending", permission.pending()));
    }
}
