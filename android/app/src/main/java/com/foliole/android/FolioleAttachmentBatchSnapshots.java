package com.foliole.android;

import com.foliole.android.framed.AttachmentBatchOperation;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

final class FolioleAttachmentBatchSnapshots {
    private FolioleAttachmentBatchSnapshots() {}
    static JSObject read(AttachmentBatchOperation operation) {
        var snapshot = operation.snapshot();
        var files = new JSArray();
        for (var fact : snapshot.files) files.put(new JSObject().put("sequence", fact.sequence).put("storage_key", fact.key)
            .put("byte_length", fact.length).put("state", fact.claimed ? "claimed" : "sealed"));
        var settlements = new JSArray();
        for (var receipt : snapshot.settlements) settlements.put(new JSObject().put("sequence", receipt.sequence).put("outcome", receipt.published ? "published" : "failed"));
        var result = new JSObject().put("library_key", operation.owner.libraryKey()).put("generation_id", operation.owner.generationId())
            .put("operation_id", operation.id).put("files", files).put("settlements", settlements).put("capacity", 4).put("active_operations", snapshot.active).put("state", snapshot.state);
        if (snapshot.entries != null) {
            JSArray entries = new JSArray();
            for (var entry : snapshot.entries) entries.put(new JSObject().put("storage_key", entry.key).put("byte_length", entry.length)
                .put("offset", entry.offset).put("state", entry.state).put("blocks", entry.blocks).put("pending", entry.pending));
            result.put("result", new JSObject().put("entries", entries).put("bytes", snapshot.bytes).put("blocks", snapshot.blocks));
        } else if (!snapshot.error.isEmpty()) result.put("error", snapshot.error);
        if (!snapshot.outcome.isEmpty()) result.put("outcome", snapshot.outcome);
        return result;
    }
}
