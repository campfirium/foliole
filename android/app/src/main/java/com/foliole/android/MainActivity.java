package com.foliole.android;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;

import java.io.InputStream;
import java.security.MessageDigest;

@SuppressLint("Instantiatable")
public class MainActivity extends BridgeActivity {
    private static final String LOG_TAG = "FolioleMainActivity";
    private static final String WEB_ASSET_PREFS = "foliole_companion_web_assets";
    private static final String WEB_ASSET_SIGNATURE_KEY = "web_asset_signature";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        String webAssetSignature = getWebAssetSignature();
        boolean refreshWebAssets = webAssetSignature != null && shouldRefreshWebAssets(webAssetSignature);
        registerPlugin(CapacitorSQLitePlugin.class);
        registerPlugin(FolioleCompanionBootstrapPlugin.class);
        registerPlugin(FolioleCompanionAppDataPlugin.class);
        registerPlugin(FolioleCompanionSyncPackTransferPlugin.class);
        registerPlugin(FolioleCompanionSyncPlugin.class);
        registerPlugin(FolioleCompanionAlternativePlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (refreshWebAssets) {
            webView.clearCache(true);
            String refreshUrl = getBridge().getLocalUrl() + "/?foliole-app-assets=" + webAssetSignature;
            Log.i(LOG_TAG, "Refreshing bundled WebView assets: " + refreshUrl);
            webView.post(() -> webView.loadUrl(refreshUrl));
        }

        // Draw behind the status bar and navigation bar so the WebView gets
        // real env(safe-area-inset-*) values. Capacitor surfaces these to the
        // page automatically once the decor fits-system-windows flag is off.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }

    private boolean shouldRefreshWebAssets(String webAssetSignature) {
        SharedPreferences prefs = getSharedPreferences(WEB_ASSET_PREFS, MODE_PRIVATE);
        if (prefs.getString(WEB_ASSET_SIGNATURE_KEY, "").equals(webAssetSignature)) {
            return false;
        }
        prefs.edit().putString(WEB_ASSET_SIGNATURE_KEY, webAssetSignature).commit();
        return true;
    }

    private String getWebAssetSignature() {
        try (InputStream input = getAssets().open("public/index.html")) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                digest.update(buffer, 0, count);
            }
            return toHex(digest.digest());
        } catch (Exception error) {
            Log.w(LOG_TAG, "Bundled WebView asset signature unavailable; skipping cache refresh", error);
            return null;
        }
    }

    private String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
