package com.foliole.android;

import android.content.Context;
import android.util.Base64;

import org.json.JSONObject;

import java.io.OutputStream;

final class FolioleCompanionSyncIdentityPushRoute {
    private FolioleCompanionSyncIdentityPushRoute() {}

    static void handle(Context context, JSONObject config, FolioleCompanionSyncGroupDataBridge bridge,
            FolioleCompanionHttpRequest request, OutputStream output, String peer,
            JSONObject input) throws Exception {
        FolioleCompanionSyncPackTransfer.ValidatedPack pack = null;
        try {
            byte[] archive = decode(input);
            pack = FolioleCompanionSyncPackTransfer.storeReceivedArchive(context, archive,
                config.getString("device_id"), peer);
            JSONObject result = bridge.request("apply_identity_pack", new JSONObject()
                .put("authenticated_device_id", peer)
                .put("local_device_id", config.getString("device_id"))
                .put("host_name", config.getString("device_name"))
                .put("manifest", pack.manifest)
                .put("pack_path", pack.file.getAbsolutePath()));
            FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output, 200, result);
        } catch (IllegalArgumentException | IllegalStateException failure) {
            String code = failure.getMessage();
            FolioleCompanionWorkgroupHttp.writeJson(context, config, request, output,
                409, new JSONObject().put("error", code == null ? "sync_identity_push_invalid" : code));
        } finally {
            if (pack != null) FolioleCompanionSyncPackTransfer.deleteCachedPack(
                context, pack.file.getAbsolutePath());
        }
    }

    private static byte[] decode(JSONObject input) throws Exception {
        String value = input.optString("archive_base64url", "");
        if (value.isEmpty() || value.length() > 1398104 || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("sync_identity_push_invalid");
        }
        byte[] archive;
        try { archive = Base64.decode(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
        catch (IllegalArgumentException failure) {
            throw new IllegalArgumentException("sync_identity_push_invalid", failure);
        }
        String canonical = Base64.encodeToString(archive,
            Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        if (archive.length > FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES ||
            !canonical.equals(value)) throw new IllegalArgumentException("sync_identity_push_invalid");
        return archive;
    }
}
