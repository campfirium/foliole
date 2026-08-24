package com.foliole.android;

import android.app.Activity;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;

import java.util.concurrent.Callable;

final class FolioleCompanionSyncGroupProviderStart {
    private FolioleCompanionSyncGroupProviderStart() {}

    static JSObject run(
        Context context, Activity activity, PluginCall call, Object owner,
        FolioleCompanionSyncGroupDataBridge.Dispatcher dispatcher,
        Callable<Boolean> participation
    ) throws Exception {
        android.util.Log.d("FolioleSyncProvider", "Start request entered");
        JSONObject group = call.getData().getJSONObject(key(context, "group"));
        FolioleCompanionSyncGroupDataBridge bridge = FolioleCompanionSyncGroupDataBridge.current();
        bridge.replaceDispatcher(dispatcher);
        FolioleCompanionCurrentGroupCredential credential =
            FolioleCompanionCurrentGroupCredential.load(group.getString("group_id"));
        android.util.Log.d("FolioleSyncProvider", "Start credential ready");
        boolean participating = participation.call();
        android.util.Log.d("FolioleSyncProvider", "Start participation ready");
        JSObject result = FolioleCompanionSyncGroupProvider.startReady(
            context, activity, call, owner, dispatcher, participating, group, bridge, credential
        );
        android.util.Log.d("FolioleSyncProvider", "Start request applied");
        return result;
    }

    private static String key(Context context, String name) throws Exception {
        return FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderRequestKey(context, name);
    }
}
