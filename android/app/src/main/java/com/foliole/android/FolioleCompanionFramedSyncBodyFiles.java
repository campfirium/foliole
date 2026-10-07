package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.FramedSyncBodyRangeResponse;
import com.foliole.android.framed.FramedSyncVerifiedBodySpool;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONObject;

final class FolioleCompanionFramedSyncBodyFiles implements AutoCloseable {
    private final Path directory;
    private final JSONObject selection;
    private final String transferId;

    FolioleCompanionFramedSyncBodyFiles(Context context, JSONObject selection, String transferId) throws Exception {
        this.selection = new JSONObject();
        for (String key : new String[] {"group_id", "sender_device_id", "sender_library_epoch",
                "receiver_device_id", "receiver_library_epoch"}) {
            this.selection.put(key, selection.getString(key));
        }
        this.transferId = transferId;
        directory = Files.createTempDirectory(context.getCacheDir().toPath(), "foliole-framed-bodies-");
    }

    File resolve(byte[] hash, long length) throws Exception {
        return FramedSyncVerifiedBodySpool.write(hash, length, directory.toFile(), (offset, size) -> {
            JSONObject request = new JSONObject(selection.toString()).put("transfer_id", transferId)
                .put("sha256", hex(hash)).put("offset", Long.toString(offset)).put("max_bytes", size);
            JSONObject response = FolioleCompanionSyncGroupDataBridge.current().request(
                "read_framed_body_range", request);
            return FramedSyncBodyRangeResponse.decode(response, hash, offset, size);
        });
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
