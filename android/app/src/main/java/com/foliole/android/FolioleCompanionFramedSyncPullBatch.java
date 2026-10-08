package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.*;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.InputStream;
import java.net.URL;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Receive only the returned stable prefix through original per-object admission, apply and receipt. */
final class FolioleCompanionFramedSyncPullBatch {
    private FolioleCompanionFramedSyncPullBatch() {}

    static JSObject pull(Context host, PluginCall call) throws Exception {
        var budget = FramedSyncPayloadBudgetRegistry.current();
        var requests = FolioleCompanionFramedSyncPullBatchInput.requests(call);
        String group = FolioleCompanionFramedSyncBatchInput.required(call, "sync_group_id");
        String remote = FolioleCompanionFramedSyncBatchInput.required(call, "receiver_device_id");
        String remoteEpoch = FolioleCompanionFramedSyncBatchInput.required(call, "receiver_library_epoch");
        var credential = FolioleCompanionCurrentGroupCredential.load(group, budget);
        var bridge = FolioleCompanionSyncGroupDataBridge.current();
        String epoch = bridge.request("load_member_state", new JSONObject(), budget).getString("library_epoch");
        String path = FolioleCompanionFramedSyncOutbound.path(credential.deviceId, epoch, remote, remoteEpoch);
        URL url = new URL(FolioleCompanionFramedSyncOutbound.join(
            FolioleCompanionFramedSyncBatchInput.required(call, "endpoint_url"), path));
        byte[] key = FolioleCompanionFramedSyncOutbound.decodeGroupKey(credential.workgroupKey);
        var context = new FramedSyncTransferContext(group, remote, remoteEpoch, credential.deviceId, epoch);
        var session = new FramedSyncSessionContext(group, credential.deviceId, epoch, remote, remoteEpoch);
        try (var staging = new FramedSyncTransferSQLite(host);
             var nonces = new FramedSyncSessionNonceSQLite(host);
             var body = FramedSyncSessionFile.create(host.getCacheDir(), key, session, consumer -> {
                 for (var message : FolioleCompanionFramedSyncPullBatchInput.messages(requests)) consumer.accept(message);
             }, nonces, budget)) {
            return FramedSyncHttpTransport.postStream(url, group, remote, remoteEpoch,
                FolioleCompanionSyncGroupSigning.framedHeaders(credential, group, path, body.sha256()),
                body::replay, input -> receive(input, requests, unit -> {
                    var received = staging.receive(unit.input, key, context, budget,
                        header -> FolioleCompanionFramedSyncRequestedFacts.require(unit.request, header));
                    var receipt = FolioleCompanionFramedSyncApply.apply(bridge, staging, received.transferId(),
                        context, credential.deviceId, epoch, budget);
                    try (var reply = staging.receiptBody(key, receipt, budget)) {
                        FramedSyncHttpTransport.postNoResponse(url, group, remote, remoteEpoch,
                            FolioleCompanionSyncGroupSigning.framedHeaders(credential, group, path, reply.sha256()), reply::replay);
                    }
                    return FolioleCompanionFramedSyncOutbound.result(receipt);
                }));
        }
    }

    interface Consumer { JSObject accept(Unit unit) throws Exception; }
    static final class Unit {
        final InputStream input;
        final FolioleCompanionFramedSyncPullInput.Request request;
        Unit(InputStream input, FolioleCompanionFramedSyncPullInput.Request request) {
            this.input = input; this.request = request;
        }
    }

    static JSObject receive(InputStream input, List<FolioleCompanionFramedSyncPullInput.Request> requests,
        Consumer consumer) throws Exception {
        JSONArray received = new JSONArray();
        var prefix = receiveAcknowledgedPrefix(input, requests.size(), (stream, index) ->
            consumer.accept(new Unit(stream, requests.get(index))));
        for (int index = 0; index < prefix.size(); index++) {
            var request = requests.get(index);
            received.put(new JSONObject().put("object_id", request.objectId).put("object_type", request.objectType)
                .put("receipt", prefix.get(index)));
        }
        return new JSObject().put("received", received);
    }

    interface AcknowledgedConsumer<T> { T accept(InputStream input, int index) throws Exception; }

    static <T> List<T> receiveAcknowledgedPrefix(InputStream input, int count, AcknowledgedConsumer<T> consumer) throws Exception {
        List<T> received = new java.util.ArrayList<>();
        try {
            FramedSyncTransferSequenceStream.read(input, count, (stream, index) -> received.add(consumer.accept(stream, index)));
        } catch (Exception error) {
            if (received.isEmpty() || !FolioleCompanionFramedSyncBatchOutbound.missingDependency(error)) throw error;
        }
        return received;
    }
}
