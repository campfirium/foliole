package com.foliole.android;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebSettings;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

@SuppressLint("Instantiatable")
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolioleCompanionBootstrapPlugin.class);
        registerPlugin(FolioleCompanionAppDataPlugin.class);
        registerPlugin(FolioleCompanionSyncPackTransferPlugin.class);
        registerPlugin(FolioleCompanionSyncPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Draw behind the status bar and navigation bar so the WebView gets
        // real env(safe-area-inset-*) values. Capacitor surfaces these to the
        // page automatically once the decor fits-system-windows flag is off.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }
}
