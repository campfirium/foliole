package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.FramedSyncFiles;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

final class FolioleRequestSyncRoute {
    private FolioleRequestSyncRoute() {}

    static void respond(Context context, FolioleCompanionSyncGroupDataBridge bridge, InputStream input,
        OutputStream output, Map<String, String> query, String groupId, File temporary,
        FramedSyncPayloadBudget owner) throws Exception {
        String mode = query.get("request");
        if (!java.util.Set.of("inventory", "pull", "object", "pulls", "objects", "attachments", "round_finish").contains(mode)) {
            throw new IllegalArgumentException("request_sync_mode_invalid");
        }
        FramedSyncFiles files = new FramedSyncFiles(context, owner.libraryKey());
        String directory = "requests/" + UUID.randomUUID();
        File response = File.createTempFile("request-sync-response-", ".body", temporary);
        boolean admitted = false;
        try {
            FolioleRequestSyncHttpChunks.Check progress = () -> touchRound(bridge, owner,
                query.get("initiator_device_id"), query.get("peer_round_id"), "inbound", false);
            var chunks = FolioleRequestSyncHttpChunks.read(files, directory, input, () -> check(owner), () -> {
                if ("continue".equals(query.get("peer_round_mode")) || "finish".equals(query.get("peer_round_mode"))) progress.run();
            });
            JSONObject payload = new JSONObject().put("directory", directory).put("mode", mode)
                .put("library_key", owner.libraryKey()).put("generation_id", owner.generationId())
                .put("group_id", groupId).put("request_chunk_count", chunks.getInt("response_chunk_count"))
                .put("request_byte_length", chunks.getLong("response_byte_length"));
            for (String key : new String[] { "initiator_device_id", "initiator_library_epoch", "responder_device_id",
                    "responder_library_epoch", "object_type", "global_id", "peer_round_id", "peer_round_mode" }) {
                if (query.containsKey(key)) payload.put(key, query.get(key));
            }
            JSONObject result = bridge.request("respond_request_sync", payload, owner);
            admitted = true;
            try (var body = new FileOutputStream(response)) {
                FolioleRequestSyncHttpChunks.write(files, directory, result.getInt("response_chunk_count"), body, () -> check(owner), progress);
            }
            FolioleCompanionHttpResponse.framed(output, response, query.get("responder_device_id"), query.get("responder_library_epoch"), progress);
            if ("single".equals(query.get("peer_round_mode")) || "finish".equals(query.get("peer_round_mode"))) {
                touchRound(bridge, owner, query.get("initiator_device_id"), query.get("peer_round_id"), "inbound", true);
            }
        } catch (Exception error) {
            if (admitted) {
                try { touchRound(bridge, owner, query.get("initiator_device_id"),
                    query.get("peer_round_id"), "inbound", true); }
                catch (Exception cleanup) { error.addSuppressed(cleanup); }
            }
            throw error;
        } finally {
            try { files.remove(directory); }
            finally { java.nio.file.Files.deleteIfExists(response.toPath()); }
        }
    }

    static void touchRound(FolioleCompanionSyncGroupDataBridge bridge, FramedSyncPayloadBudget owner,
        String peer, String roundId, String direction, boolean finish) throws Exception {
        bridge.request("touch_request_sync_round", new JSONObject().put("library_key", owner.libraryKey())
            .put("generation_id", owner.generationId()).put("peer_device_id", peer).put("peer_round_id", roundId)
            .put("direction", direction).put("finish_round", finish), owner);
    }

    private static void check(FramedSyncPayloadBudget owner) {
        if (owner.isClosed()) throw new IllegalStateException("framed_sync_payload_budget_closed");
    }
}
