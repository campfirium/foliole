package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.FramedSyncBodyResponse;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncFrozenBodySpool;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncBodyFiles implements AutoCloseable {
    private final Path directory;
    private final JSONObject selection;
    private final String transferId;
    private final FramedSyncPayloadBudget budget;

    FolioleCompanionFramedSyncBodyFiles(Context context, JSONObject selection, String transferId,
        FramedSyncPayloadBudget budget) throws Exception {
        this.budget = budget;
        this.selection = new JSONObject();
        for (String key : new String[] {"group_id", "sender_device_id", "sender_library_epoch",
                "receiver_device_id", "receiver_library_epoch"}) {
            this.selection.put(key, selection.getString(key));
        }
        this.transferId = transferId;
        directory = Files.createTempDirectory(context.getCacheDir().toPath(), "foliole-framed-bodies-");
    }

    File resolve(byte[] hash, long length) throws Exception {
        try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            return FramedSyncFrozenBodySpool.write(hash, length, directory.toFile(), () -> {
                JSONObject request = new JSONObject(selection.toString()).put("transfer_id", transferId)
                    .put("sha256", hex(hash)).put("byte_length", Long.toString(length))
                    .put("payload_loan", FolioleCompanionFramedSyncPayloadBudgetActions.description(loan));
                JSONObject response = FolioleCompanionSyncGroupDataBridge.current().request(
                    "read_framed_body", request, budget);
                return FramedSyncBodyResponse.decode(response, hash, length);
            });
        }
    }

    @Override public void close() throws Exception {
        try (var entries = Files.list(directory)) {
            var iterator = entries.iterator();
            while (iterator.hasNext()) Files.deleteIfExists(iterator.next());
        }
        Files.deleteIfExists(directory);
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(64);
        for (byte item : bytes) result.append(String.format("%02x", item & 0xff));
        return result.toString();
    }
}
