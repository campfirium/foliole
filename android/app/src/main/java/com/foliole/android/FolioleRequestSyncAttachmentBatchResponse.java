package com.foliole.android;

import android.util.Base64;
import com.foliole.android.framed.*;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.InputStream;
import java.util.Arrays;

final class FolioleRequestSyncAttachmentBatchResponse {
    interface Reader { JSObject read(InputStream input) throws Exception; }
    interface Transfer { JSObject run(Reader reader) throws Exception; }
    private FolioleRequestSyncAttachmentBatchResponse() {}

    static JSObject execute(PluginCall call, FramedSyncPayloadBudget owner, FolioleRequestSyncHttpChunks.Check check,
        FolioleRequestSyncHttpChunks.Check progress, Transfer transfer) throws Exception {
        String id = call.getString("request_id");
        if (!id.equals(call.getObject("attachment_batch").getString("operation_id"))) throw new IllegalArgumentException("attachment_batch_http_mismatch");
        var batch = FolioleAttachmentBatches.get(owner, id);
        batch.start();
        Exception failure = null;
        try {
            check.run();
            var credential = FolioleCompanionCurrentGroupCredential.load(call.getString("sync_group_id"), owner);
            check.run(); batch.check();
            var expected = new FramedSyncSessionContext(call.getString("sync_group_id"), credential.deviceId, batch.initiatorEpoch,
                call.getString("receiver_device_id"), call.getString("receiver_library_epoch"));
            if (!Arrays.equals(expected.deriveContextId(new byte[16]), batch.context.deriveContextId(new byte[16]))) {
                throw new SecurityException("attachment_batch_http_mismatch");
            }
            byte[] key = Base64.decode(credential.workgroupKey, Base64.URL_SAFE | Base64.NO_WRAP);
            return transfer.run(input -> {
                var stream = new FramedSyncStreamReader(input).budgeted(owner,
                    FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD);
                long[] touched = {0};
                RequestSyncAttachmentBatchReader.read(stream, key, batch.context, batch.permission, () -> {
                    check.run(); batch.check(); batch.progress();
                    long now = System.nanoTime();
                    if (touched[0] == 0 || now - touched[0] >= 250_000_000L) { progress.run(); touched[0] = now; }
                }, batch.receiver::accept);
                return new JSObject().put("response_chunk_count", 0).put("response_byte_length", 0);
            });
        } catch (Exception error) { failure = error; throw error; }
        finally { batch.dataExited(failure); }
    }
}
