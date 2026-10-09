package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.*;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.OutputStream;
import java.net.URL;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Select and seal one original unit at a time, then post only eligible stable prefixes. */
final class FolioleCompanionFramedSyncBatchOutbound {
    private FolioleCompanionFramedSyncBatchOutbound() {}
    static JSObject send(Context host, PluginCall call) throws Exception {
        var budget = FramedSyncPayloadBudgetRegistry.current();
        FolioleCompanionFramedSyncBatchInput.validate(call);
        String group = FolioleCompanionFramedSyncBatchInput.required(call, "sync_group_id");
        String endpoint = FolioleCompanionFramedSyncBatchInput.required(call, "endpoint_url");
        var credential = FolioleCompanionCurrentGroupCredential.load(group, budget);
        String epoch = FolioleCompanionFramedSyncOutbound.requiredMemberState("library_epoch", budget);
        var selections = FolioleCompanionFramedSyncBatchInput.selections(call, credential.deviceId, epoch);
        String receiver = FolioleCompanionFramedSyncBatchInput.required(call, "receiver_device_id");
        String receiverEpoch = FolioleCompanionFramedSyncBatchInput.required(call, "receiver_library_epoch");
        var context = new FramedSyncTransferContext(group, credential.deviceId, epoch, receiver, receiverEpoch);
        byte[] key = FolioleCompanionFramedSyncOutbound.decodeGroupKey(credential.workgroupKey);
        JSObject[] outcomes = new JSObject[selections.size()];
        List<FolioleCompanionFramedSyncSealedOutbound> owned = new ArrayList<>();
        var packing = new FramedSyncBatchPacking<FolioleCompanionFramedSyncSealedOutbound>(items ->
            deliver(items, endpoint, group, credential, epoch, receiver, receiverEpoch, key, budget, outcomes));
        try {
            for (int index = 0; index < selections.size(); index++) {
                JSONObject selection = selections.get(index);
                try {
                    var item = FolioleCompanionFramedSyncSealedOutbound.prepare(host, selection, index, key, context, budget);
                    owned.add(item);
                } catch (Exception error) {
                    if (!missingDependency(error)) throw error;
                    packing.flush();
                    outcomes[index] = deferred(selection.getString("object_id"), selection.getString("object_type"), error);
                    continue;
                }
                packing.offer(owned.get(owned.size() - 1));
            }
            packing.flush();
            return new JSObject().put("outcomes", new JSONArray(List.of(outcomes)));
        } finally { for (var item : owned) item.close(); }
    }

    private static void deliver(List<FolioleCompanionFramedSyncSealedOutbound> items, String endpoint,
        String group, FolioleCompanionCurrentGroupCredential credential, String senderEpoch,
        String receiver, String receiverEpoch, byte[] key, FramedSyncPayloadBudget budget, JSObject[] outcomes) throws Exception {
        try {
            deliverWithDependencyRetry(items, item -> outcomes[item.index] != null && "committed".equals(outcomes[item.index].optString("kind")),
                units -> deliverOnce(units, endpoint, group, credential, senderEpoch, receiver, receiverEpoch, key, budget, outcomes),
                (item, error) -> outcomes[item.index] = deferred(item.objectId, item.objectType, error));
        } finally { for (var item : items) item.close(); }
    }

    interface Delivery<T> { void send(List<T> items) throws Exception; }
    interface Deferral<T> { void accept(T item, Exception error) throws Exception; }

    static <T> void deliverWithDependencyRetry(List<T> items, java.util.function.Predicate<T> committed,
        Delivery<T> delivery, Deferral<T> deferral) throws Exception {
        try { delivery.send(items); }
        catch (Exception error) {
            if (!missingDependency(error)) throw error;
            if (items.size() == 1) deferral.accept(items.get(0), error);
            else for (T item : items) if (!committed.test(item)) {
                deliverWithDependencyRetry(List.of(item), committed, delivery, deferral);
            }
        }
    }

    private static void deliverOnce(List<FolioleCompanionFramedSyncSealedOutbound> items, String endpoint,
        String group, FolioleCompanionCurrentGroupCredential credential, String senderEpoch,
        String receiver, String receiverEpoch, byte[] key, FramedSyncPayloadBudget budget, JSObject[] outcomes) throws Exception {
        String path = FolioleCompanionFramedSyncOutbound.path(credential.deviceId, senderEpoch, receiver, receiverEpoch);
        requireBatch(items);
        var headers = FolioleCompanionSyncGroupSigning.framedHeaders(credential, group, path, hash(items, budget));
        List<FramedSyncReceiptSequenceReader.Expected> expected = new ArrayList<>();
        for (var item : items) expected.add(new FramedSyncReceiptSequenceReader.Expected(item.transferId, item.contentId));
        FramedSyncHttpTransport.postRawStream(new URL(FolioleCompanionFramedSyncOutbound.join(endpoint, path)), group,
            receiver, receiverEpoch, headers,
            output -> { for (var item : items) item.copyTo(output, budget); }, input -> {
                FramedSyncReceiptSequenceReader.read(input, key, receiver, receiverEpoch, expected, budget,
                    receipt -> committed(items, receipt, budget, outcomes));
                return null;
            });
    }

    private static void committed(List<FolioleCompanionFramedSyncSealedOutbound> items,
        com.foliole.sync.v22.TransferReceipt receipt, FramedSyncPayloadBudget budget, JSObject[] outcomes) throws Exception {
        FolioleCompanionFramedSyncOutbound.complete(receipt, budget);
        for (var item : items) if (MessageDigest.isEqual(item.transferId, receipt.getTransferId().toByteArray())) {
            outcomes[item.index] = new JSObject().put("kind", "committed").put("object_id", item.objectId)
                .put("object_type", item.objectType).put("receipt", FolioleCompanionFramedSyncOutbound.result(receipt));
            return;
        }
        throw new IllegalArgumentException("framed_sync_batch_receipt_unexpected");
    }
    private static void requireBatch(List<FolioleCompanionFramedSyncSealedOutbound> items) {
        long size = 0;
        var identities = new HashSet<String>();
        for (var item : items) {
            if (!identities.add(FolioleCompanionFramedSyncOutbound.hex(item.transferId))) throw new IllegalArgumentException("framed_sync_batch_duplicate_transfer");
            size += item.messageBytes();
            if (items.size() > 1 && !item.batchReady()) throw new IllegalArgumentException("framed_sync_batch_not_ready");
        }
        if (items.size() > 1 && size > FramedSyncTransferSequence.MAX_MESSAGE_BYTES) throw new IllegalArgumentException("framed_sync_batch_message_limit_exceeded");
    }
    private static String hash(List<FolioleCompanionFramedSyncSealedOutbound> items, FramedSyncPayloadBudget budget) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        try (var output = new DigestOutputStream(FolioleCompanionFramedSyncOutbound.discardingOutput(), digest)) {
            for (var item : items) item.copyTo(output, budget);
        }
        return FolioleCompanionFramedSyncOutbound.hex(digest.digest());
    }
    private static JSObject deferred(String id, String type, Exception error) {
        return new JSObject().put("kind", "deferred").put("object_id", id).put("object_type", type).put("error", error.getMessage());
    }
    static boolean missingDependency(Exception error) {
        String message = error.getMessage();
        if (message == null) return false;
        if (message.startsWith("framed_sync_http_400:")) message = message.substring("framed_sync_http_400:".length());
        for (String prefix : new String[] { "framed_sync_node_parent_missing:", "node_position_lineage_unproven:",
            "parent_order_position_lineage_unproven:", "sync_parent_order_body_unavailable:",
            "framed_sync_review_node_missing:", "sync_node_open_state_node_missing:",
            "sync_parent_order_member_missing:", "framed_sync_parent_relation_version_missing:" }) {
            if (message.startsWith(prefix) && message.substring(prefix.length()).matches("[A-Za-z0-9_-]{1,128}")) return true;
        }
        return false;
    }
}
