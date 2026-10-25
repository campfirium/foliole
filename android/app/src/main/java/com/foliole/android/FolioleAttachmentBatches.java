package com.foliole.android;

import android.content.Context;
import android.util.Base64;
import com.foliole.android.framed.*;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.*;
import java.util.concurrent.ExecutorService;

final class FolioleAttachmentBatches {
    static final String EVENT = "attachmentBatchChanged";
    private static final Map<FramedSyncPayloadBudget, FolioleAttachmentBatches> OWNERS = new HashMap<>();
    private final Map<String, AttachmentBatchOperation> operations = new LinkedHashMap<>();
    private final AttachmentCompletionCapacity capacity = new AttachmentCompletionCapacity();
    interface Notify { void send(JSObject value); }
    private FolioleAttachmentBatches() {}

    static void command(Context app, PluginCall call, boolean listening, Notify notify, ExecutorService verification) {
        try {
            FramedSyncPayloadBudget owner = owner(call);
            String action = call.getString("action", ""), id = id(call.getString("operation_id"));
            FolioleAttachmentBatches batches;
            synchronized (OWNERS) {
                OWNERS.entrySet().removeIf(entry -> entry.getKey() != owner && entry.getValue().allClosed());
                batches = OWNERS.computeIfAbsent(owner, key -> new FolioleAttachmentBatches());
            }
            if (action.equals("open")) {
                if (!listening) throw new IllegalStateException("attachment_batch_listener_missing");
                call.resolve(FolioleAttachmentBatchSnapshots.read(batches.open(app, owner, id, call, () -> notify.send(identity(owner, id))))); return;
            }
            AttachmentBatchOperation operation = batches.get(id);
            if (action.equals("wait_exit")) {
                operation.exit().whenComplete((result, error) -> { if (error == null) call.resolve(FolioleAttachmentBatchSnapshots.read(operation)); else call.reject(error.getMessage()); }); return;
            }
            if (action.equals("verify") || action.equals("publish") || action.equals("discard")) {
                int sequence = sequence(call, "sequence");
                verification.execute(() -> {
                    try {
                        if (action.equals("verify")) {
                            boolean valid = operation.verify(sequence);
                            call.resolve(FolioleAttachmentBatchSnapshots.read(operation).put("verification", new JSObject().put("sequence", sequence).put("valid", valid)));
                        }
                        else { operation.finalizeFile(action, sequence); call.resolve(FolioleAttachmentBatchSnapshots.read(operation)); }
                    } catch (Exception error) { call.reject(error.getMessage(), error); }
                }); return;
            }
            if (action.equals("claim")) operation.queue.claim(sequences(call.getArray("sequences")));
            else if (action.equals("settle")) {
                String outcome = call.getString("outcome");
                if (!"published".equals(outcome) && !"failed".equals(outcome)) throw invalid();
                operation.receiver.settle(sequence(call, "sequence"), outcome.equals("published")); operation.changed();
            } else if (action.equals("stop")) operation.stop();
            else if (action.equals("dispose")) batches.dispose(id);
            else if (!action.equals("read")) throw invalid();
            call.resolve(FolioleAttachmentBatchSnapshots.read(operation));
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    private synchronized AttachmentBatchOperation open(Context app, FramedSyncPayloadBudget owner, String id,
        PluginCall call, Runnable wake) throws Exception {
        if (operations.containsKey(id)) throw new IllegalStateException("attachment_batch_duplicate");
        operations.entrySet().removeIf(entry -> entry.getValue().closed());
        if (operations.size() >= 6) throw new IllegalStateException("attachment_batch_capacity");
        JSArray values = call.getArray("entries"); JSObject context = call.getObject("context");
        if (values == null || values.length() > 256 || context == null) throw invalid();
        List<AttachmentBatchAuthorization.Entry> entries = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) {
            var entry = values.getJSONObject(i);
            entries.add(new AttachmentBatchAuthorization.Entry(entry.getString("storage_key"), number(entry, "offset"),
                number(entry, "byte_length"), number(entry, "partial_length")));
        }
        var session = new FramedSyncSessionContext(context.getString("sync_group_id"), context.getString("initiator_device_id"),
            context.getString("initiator_library_epoch"), context.getString("receiver_device_id"), context.getString("receiver_library_epoch"));
        byte[] requestId = Base64.decode(call.getString("request_id_base64", ""), Base64.NO_WRAP);
        String algorithm = FolioleCompanionResourceReadQueryRules.contentBlobCasString(app, "hashAlgorithm");
        var files = FolioleAttachmentBlockFiles.owner(app, owner);
        var operation = new AttachmentBatchOperation(id, owner, files.store, files::use, capacity,
            requestId, entries, session, context.getString("initiator_library_epoch"), algorithm, wake, () -> FolioleCompanionRequestSyncHttp.cancelBatch(owner, id));
        operations.put(id, operation); return operation;
    }
    static AttachmentBatchOperation get(FramedSyncPayloadBudget owner, String id) {
        synchronized (OWNERS) {
            var batches = OWNERS.get(owner);
            if (batches == null) throw new IllegalStateException("attachment_batch_missing");
            return batches.get(id);
        }
    }
    private synchronized AttachmentBatchOperation get(String id) {
        var operation = operations.get(id);
        if (operation == null) throw new IllegalStateException("attachment_batch_missing");
        return operation;
    }
    private synchronized boolean allClosed() { return operations.values().stream().allMatch(AttachmentBatchOperation::closed); }
    private synchronized void dispose(String id) {
        if (!get(id).closed()) throw new IllegalStateException("attachment_batch_running");
        operations.remove(id);
    }
    private static JSObject identity(FramedSyncPayloadBudget owner, String id) {
        return new JSObject().put("library_key", owner.libraryKey()).put("generation_id", owner.generationId()).put("operation_id", id);
    }
    private static FramedSyncPayloadBudget owner(PluginCall call) {
        var owner = FramedSyncPayloadBudgetRegistry.current();
        if (owner.isClosed() || !owner.libraryKey().equals(call.getString("library_key")) || !owner.generationId().equals(call.getString("generation_id"))) throw invalid();
        return owner;
    }
    private static String id(String value) {
        if (value == null || !UUID.fromString(value).toString().equals(value)) throw invalid();
        return value;
    }
    private static long number(org.json.JSONObject value, String name) throws Exception {
        Object raw = value.get(name);
        if (!(raw instanceof Number)) throw invalid();
        double number = ((Number) raw).doubleValue();
        if (!Double.isFinite(number) || number < 0 || number > 8589934592L || number != Math.floor(number)) throw invalid();
        return (long) number;
    }
    private static int sequence(PluginCall call, String name) {
        Double value = call.getDouble(name);
        if (value == null || value < 1 || value > 256 || value != Math.floor(value)) throw invalid();
        return value.intValue();
    }
    private static List<Integer> sequences(JSArray values) throws Exception {
        if (values == null || values.length() > 4) throw invalid();
        var result = new ArrayList<Integer>();
        for (int i = 0; i < values.length(); i++) {
            Object raw = values.get(i);
            if (!(raw instanceof Number)) throw invalid();
            double value = ((Number) raw).doubleValue();
            if (value < 1 || value > 256 || value != Math.floor(value)) throw invalid();
            result.add((int) value);
        }
        return result;
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("attachment_batch_command_invalid"); }
}
