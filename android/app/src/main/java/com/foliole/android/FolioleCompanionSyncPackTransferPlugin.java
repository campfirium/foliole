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
                String urlKey = FolioleCompanionHostBridgeContractDefinitions.syncPackTransferUrlRequestKey(getContext());
                String url = call.getString(urlKey);
                if (url == null || url.trim().isEmpty()) {
                    call.reject(urlKey + " is required.");
                    return;
                }
                File packFile = FolioleCompanionSyncPackTransfer.downloadToCache(
                    getContext(),
                    url.trim(),
                    call.getData().optJSONObject(
                        FolioleCompanionHostBridgeContractDefinitions.syncPackTransferHeadersRequestKey(getContext())
                    )
                );
                JSObject result = new JSObject();
                result.put(
                    FolioleCompanionHostBridgeContractDefinitions.syncPackTransferPackPathResponseKey(getContext()),
                    packFile.getAbsolutePath()
                );
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Failed to download companion desktop sync pack.", exception);
            }
        }).start();
    }

    @PluginMethod
    public void deleteDownloadedSyncPack(PluginCall call) {
        try {
            String packPathKey = FolioleCompanionHostBridgeContractDefinitions.syncPackTransferPackPathRequestKey(getContext());
            String packPath = call.getString(packPathKey);
            if (packPath == null || packPath.trim().isEmpty()) {
                call.reject(packPathKey + " is required.");
                return;
            }
            JSObject result = new JSObject();
            result.put(
                FolioleCompanionHostBridgeContractDefinitions.syncPackTransferDeletedResponseKey(getContext()),
                FolioleCompanionSyncPackTransfer.deleteCachedPack(getContext(), packPath.trim())
            );
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Failed to delete companion desktop sync pack.", exception);
        }
    }

}
