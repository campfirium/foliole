package com.foliole.android;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.TypedArray;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

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
        registerPlugin(FolioleCompanionShareInboxPlugin.class);
        receiveSharedText(getIntent());
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (refreshWebAssets) {
            webView.clearCache(true);
            String refreshUrl = getBridge().getLocalUrl() + "/?foliole-app-assets=" + webAssetSignature;
            Log.i(LOG_TAG, "Refreshing bundled WebView assets: " + refreshUrl);
            webView.post(() -> webView.loadUrl(refreshUrl));
        }

        // On older Android versions, let the window keep the WebView below
        // system bars. Android 15 enforces edge-to-edge, so inset its content.
        boolean edgeToEdgeRequired = Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM;
        WindowCompat.setDecorFitsSystemWindows(getWindow(), !edgeToEdgeRequired);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (edgeToEdgeRequired) applySystemBarInsets();
    }

    private void applySystemBarInsets() {
        ViewGroup container = findViewById(android.R.id.content);
        TypedArray colors = getTheme().obtainStyledAttributes(new int[] { android.R.attr.colorBackground });
        container.setBackgroundColor(colors.getColor(0, Color.WHITE));
        colors.recycle();
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, windowInsets) -> {
            Insets safe = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(container);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receiveSharedText(intent);
    }

    private void receiveSharedText(Intent intent) {
        try {
            if (FolioleCompanionShareInboxStore.enqueue(getApplicationContext(), intent)) {
                FolioleCompanionShareInboxPlugin.notifyInboxChanged();
            }
        } catch (Exception error) {
            Log.e(LOG_TAG, "Failed to persist shared text", error);
        }
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
