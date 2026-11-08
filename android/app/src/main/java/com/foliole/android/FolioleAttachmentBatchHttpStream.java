package com.foliole.android;

import android.util.Base64;
import android.content.Context;
import com.foliole.android.framed.AttachmentReceiveAuthorization;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncSessionContext;
import com.foliole.android.framed.FramedSyncStreamReader;
import com.foliole.android.framed.RequestSyncAttachmentBatchReader;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.io.InputStream;

/** One read in flight. Waiting for the consumer before reading again applies backpressure to HTTP. */
final class FolioleAttachmentBatchHttpStream {
    private PluginCall demand;
    private boolean cancelled;

    FolioleAttachmentBatchHttpStream(PluginCall first) { demand = first; }

    synchronized void next(PluginCall call) {
        if (cancelled) {
            call.reject("request_sync_http_cancelled", "E_ABORT");
            return;
        }
        if (demand != null) {
            call.reject("attachment_batch_read_unavailable");
            return;
        }
        demand = call;
        notifyAll();
    }

    synchronized void cancel() {
        cancelled = true;
        notifyAll();
    }

    JSObject read(Context app, PluginCall call, InputStream input, FolioleRequestSyncHttpChunks.Check check,
        FolioleRequestSyncHttpChunks.Check progress, FramedSyncPayloadBudget owner) throws Exception {
        var plan = call.getObject("attachment_batch_receive");
        var permissions = permissions(plan);
        var credential = FolioleCompanionCurrentGroupCredential.load(call.getString("sync_group_id"), owner);
        if (!credential.deviceId.equals(plan.getString("initiator_device_id"))) {
            throw new SecurityException("attachment_response_initiator_mismatch");
        }
        var session = new FramedSyncSessionContext(call.getString("sync_group_id"), plan.getString("initiator_device_id"),
            plan.getString("initiator_library_epoch"), call.getString("receiver_device_id"), call.getString("receiver_library_epoch"));
        var stream = new FramedSyncStreamReader(input).budgeted(owner,
            FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD);
        var key = Base64.decode(credential.workgroupKey, Base64.URL_SAFE | Base64.NO_WRAP);
        var reader = new RequestSyncAttachmentBatchReader(stream, key, session);
        var destination = new BatchDestination(app, owner, permissions.size(), progress);
        reader.read(permissions, destination, check::run);
        return destination.last;
    }

    private static List<AttachmentReceiveAuthorization> permissions(JSObject plan) throws Exception {
        var members = plan.getJSONArray("members");
        if (members.length() < 1 || members.length() > 16) throw new IllegalArgumentException("attachment_batch_member_limit");
        var permissions = new ArrayList<AttachmentReceiveAuthorization>();
        var hashes = new HashSet<String>();
        long total = 0;
        for (int index = 0; index < members.length(); index++) {
            var member = members.getJSONObject(index);
            var permission = new AttachmentReceiveAuthorization(Base64.decode(member.getString("request_id_base64"), Base64.NO_WRAP),
                member.getString("storage_key"), member.getLong("byte_length"), member.getLong("offset"), member.getInt("max_blocks"));
            total += permission.byteLength - permission.start;
            if (permission.byteLength > 2 * 1024 * 1024 || total > 8 * 1024 * 1024 || permission.maxBlocks > 4 ||
                !hashes.add(permission.storageKey.substring(0, 64))) throw new IllegalArgumentException("attachment_batch_member_invalid");
            permissions.add(permission);
        }
        return permissions;
    }

    private final class BatchDestination implements RequestSyncAttachmentBatchReader.Destination {
        private final Context app;
        private final FramedSyncPayloadBudget owner;
        private final int count;
        private final FolioleRequestSyncHttpChunks.Check progress;
        private long lastProgress;
        private JSObject last;

        BatchDestination(Context app, FramedSyncPayloadBudget owner, int count, FolioleRequestSyncHttpChunks.Check progress) {
            this.app = app;
            this.owner = owner;
            this.count = count;
            this.progress = progress;
        }

        public RequestSyncAttachmentBatchReader.Member open(AttachmentReceiveAuthorization permission) throws Exception {
            awaitDemand();
            var file = FolioleAttachmentBlockFiles.receive(app, owner, permission.storageKey, permission.start);
            return new RequestSyncAttachmentBatchReader.Member() {
                public void append(long offset, byte[] bytes) throws Exception {
                    file.append(offset, bytes);
                    long now = System.nanoTime();
                    if (lastProgress == 0 || now - lastProgress >= 250_000_000L) {
                        progress.run();
                        lastProgress = now;
                    }
                }
                public void close() throws Exception { file.close(); }
            };
        }

        public void completed(int index, AttachmentReceiveAuthorization permission) {
            var result = new JSObject().put("response_chunk_count", 0).put("response_byte_length", 0)
                .put("attachment_batch_member", new JSObject().put("index", index).put("offset", permission.offset())
                    .put("blocks", permission.blocks()).put("pending", permission.pending()));
            if (index + 1 == count) last = result;
            else deliver(result);
        }
    }

    private synchronized void awaitDemand() throws InterruptedException {
        while (demand == null && !cancelled) wait();
        if (cancelled) throw new InterruptedException("request_sync_http_cancelled");
    }

    synchronized void deliver(JSObject value) {
        if (demand != null) {
            PluginCall call = demand;
            demand = null;
            call.resolve(value);
        }
    }

    synchronized void reject(String message, String code, Exception error) {
        if (demand != null) {
            PluginCall call = demand;
            demand = null;
            call.reject(message, code, error);
        }
    }
}
