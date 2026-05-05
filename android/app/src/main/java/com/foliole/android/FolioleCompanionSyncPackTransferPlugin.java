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
                String urlKey = requestKey("url");
                String url = call.getString(urlKey);
                if (url == null || url.trim().isEmpty()) {
                    call.reject(urlKey + " is required.");
                    return;
                }
                File packFile = FolioleCompanionSyncPackTransfer.downloadToCache(
                    getContext(),
                    url.trim(),
                    call.getData().optJSONObject(requestKey("headers"))
                );
                JSObject result = new JSObject();
                result.put(responseKey("packPath"), packFile.getAbsolutePath());
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Failed to download companion desktop sync pack.", exception);
            }
        }).start();
    }

    @PluginMethod
    public void deleteDownloadedSyncPack(PluginCall call) {
        try {
            String packPathKey = requestKey("packPath");
            String packPath = call.getString(packPathKey);
            if (packPath == null || packPath.trim().isEmpty()) {
                call.reject(packPathKey + " is required.");
                return;
            }
            JSObject result = new JSObject();
            result.put(responseKey("deleted"), FolioleCompanionSyncPackTransfer.deleteCachedPack(getContext(), packPath.trim()));
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Failed to delete companion desktop sync pack.", exception);
        }
    }

    private String requestKey(String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.syncPackTransferRequestKey(getContext(), key);
    }

    private String responseKey(String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.syncPackTransferResponseKey(getContext(), key);
    }
}
