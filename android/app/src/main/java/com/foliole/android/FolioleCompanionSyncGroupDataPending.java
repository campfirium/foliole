package com.foliole.android;

import com.foliole.android.framed.FramedSyncPayloadBudget;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONObject;

final class FolioleCompanionSyncGroupDataPending {
    private final ConcurrentHashMap<String, Request> requests = new ConcurrentHashMap<>();

    CompletableFuture<JSONObject> register(String id, FramedSyncPayloadBudget owner) {
        var request = new Request(owner);
        requests.put(id, request);
        if (owner != null && owner.isClosed()) cancel(id, request, "sync_group_data_document_replaced");
        return request.future;
    }

    boolean contains(String id) { return requests.containsKey(id); }
    void remove(String id) { requests.remove(id); }

    CompletableFuture<JSONObject> future(String id) {
        var request = requests.get(id);
        return request == null ? null : request.future;
    }

    void cancelOwner(FramedSyncPayloadBudget owner) {
        if (owner == null) return;
        requests.forEach((id, request) -> {
            if (request.owner == owner) cancel(id, request, "sync_group_data_document_replaced");
        });
    }

    void close() {
        requests.forEach((id, request) -> cancel(id, request, "sync_group_data_owner_stopped"));
    }

    private void cancel(String id, Request request, String code) {
        request.future.completeExceptionally(new IllegalStateException(code));
        requests.remove(id, request);
    }

    private static final class Request {
        final FramedSyncPayloadBudget owner;
        final CompletableFuture<JSONObject> future = new CompletableFuture<>();
        Request(FramedSyncPayloadBudget owner) { this.owner = owner; }
    }
}
