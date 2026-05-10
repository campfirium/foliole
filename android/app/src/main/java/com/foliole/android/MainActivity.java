package com.foliole.android;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

@SuppressLint("Instantiatable")
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolioleCompanionBootstrapPlugin.class);
        registerPlugin(FolioleCompanionAppDataPlugin.class);
        registerPlugin(FolioleReadwiseTokenPlugin.class);
        registerPlugin(FolioleCompanionSyncPackTransferPlugin.class);
        registerPlugin(FolioleCompanionSyncPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    }
}
