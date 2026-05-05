package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "FolioleCompanionSyncPackTransfer")
public class FolioleCompanionSyncPackTransferPlugin extends Plugin {

    @PluginMethod
    public void downloadDesktopSyncPack(PluginCall call) {
        new Thread(() -> {
            try {
                String url = call.getString("url");
                if (url == null || url.trim().isEmpty()) {
                    call.reject("url is required.");
                    return;
                }
                File packFile = FolioleCompanionSyncPackTransfer.downloadToCache(
                    getContext(),
                    url.trim(),
                    call.getData().optJSONObject("headers")
                );
                JSObject result = new JSObject();
                result.put("pack_path", packFile.getAbsolutePath());
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Failed to download companion desktop sync pack.", exception);
            }
        }).start();
    }

    @PluginMethod
    public void deleteDownloadedSyncPack(PluginCall call) {
        try {
            String packPath = call.getString("pack_path");
            if (packPath == null || packPath.trim().isEmpty()) {
                call.reject("pack_path is required.");
                return;
            }
            JSObject result = new JSObject();
            result.put("deleted", FolioleCompanionSyncPackTransfer.deleteCachedPack(getContext(), packPath.trim()));
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Failed to delete companion desktop sync pack.", exception);
        }
    }
}
