package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolioleCompanionSyncPackTransfer")
public class FolioleCompanionSyncPackTransferPlugin extends Plugin {

    @PluginMethod
    public void downloadDesktopSyncPack(PluginCall call) {
        new Thread(() -> {
            try {
                String urlKey = FolioleCompanionHostBridgeContractDefinitions.syncPackTransferUrlRequestKey(getContext());
                String expectedPeerIdKey = FolioleCompanionHostBridgeContractDefinitions
                    .syncPackTransferExpectedPeerIdRequestKey(getContext());
                String expectedSourcePeerIdKey = FolioleCompanionHostBridgeContractDefinitions
                    .syncPackTransferExpectedSourcePeerIdRequestKey(getContext());
                String url = call.getString(urlKey);
                if (url == null || url.trim().isEmpty()) {
                    call.reject(urlKey + " is required.");
                    return;
                }
                String expectedPeerId = call.getString(expectedPeerIdKey);
                String expectedSourcePeerId = call.getString(expectedSourcePeerIdKey);
                if (expectedPeerId == null || expectedPeerId.trim().isEmpty()
                    || expectedSourcePeerId == null || expectedSourcePeerId.trim().isEmpty()) {
                    call.reject("Sync pack peer identities are required.");
                    return;
                }
                FolioleCompanionSyncPackTransfer.ValidatedPack pack =
                    FolioleCompanionSyncPackTransfer.downloadWithManifestToCache(
                    getContext(),
                    url.trim(),
                    call.getData().optJSONObject(
                        FolioleCompanionHostBridgeContractDefinitions.syncPackTransferHeadersRequestKey(getContext())
                    ),
                    expectedPeerId.trim(),
                    expectedSourcePeerId.trim(),
                    call.getString(FolioleCompanionHostBridgeContractDefinitions
                        .syncPackTransferMethodRequestKey(getContext()), "GET"),
                    call.getString(FolioleCompanionHostBridgeContractDefinitions
                        .syncPackTransferBodyRequestKey(getContext()))
                );
                JSObject result = new JSObject();
                result.put(
                    FolioleCompanionHostBridgeContractDefinitions.syncPackTransferPackPathResponseKey(getContext()),
                    pack.file.getAbsolutePath()
                );
                result.put(
                    FolioleCompanionHostBridgeContractDefinitions.syncPackTransferManifestResponseKey(getContext()),
                    pack.manifest
                );
                call.resolve(result);
            } catch (FolioleCompanionDesktopHttpClient.SyncPackSourceViewUnavailable exception) {
                call.reject(exception.getMessage(), "sync_pack_source_view_unavailable", exception);
            } catch (Exception exception) {
                call.reject(FolioleCompanionPluginErrors.withCause("Failed to download companion desktop sync pack.", exception), exception);
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
            call.reject(FolioleCompanionPluginErrors.withCause("Failed to delete companion desktop sync pack.", exception), exception);
        }
    }

}
