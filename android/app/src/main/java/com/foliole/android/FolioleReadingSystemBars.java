package com.foliole.android;

import android.graphics.Color;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.WebViewListener;

/** Native window adapter; the renderer owns the current reading preference and chrome state. */
final class FolioleReadingSystemBars {
    private final Window window;
    private final ViewGroup content;
    private final WebView webView;
    private final int originalCutoutMode;
    private boolean readingOverlay;
    private int chromeTop = -1;

    FolioleReadingSystemBars(MainActivity activity, WebView webView) {
        this.window = activity.getWindow();
        this.webView = webView;
        content = activity.findViewById(android.R.id.content);
        originalCutoutMode = window.getAttributes().layoutInDisplayCutoutMode;
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        WindowCompat.getInsetsController(window, window.getDecorView()).setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> applyInsets(insets));
        activity.getBridge().addWebViewListener(new WebViewListener() {
            @Override public void onPageCommitVisible(WebView view, String url) {
                chromeTop = -1;
                ViewCompat.requestApplyInsets(content);
            }
        });
        ViewCompat.requestApplyInsets(content);
    }

    void set(boolean enabled, boolean hidden) {
        readingOverlay = enabled;
        WindowManager.LayoutParams attributes = window.getAttributes();
        attributes.layoutInDisplayCutoutMode = enabled
            ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES : originalCutoutMode;
        window.setAttributes(attributes);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (hidden) controller.hide(WindowInsetsCompat.Type.statusBars());
        else controller.show(WindowInsetsCompat.Type.statusBars());
        ViewCompat.requestApplyInsets(content);
    }

    private WindowInsetsCompat applyInsets(WindowInsetsCompat insets) {
        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
        Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
        Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
        content.setPadding(Math.max(bars.left, cutout.left), readingOverlay ? 0 : Math.max(bars.top, cutout.top),
            Math.max(bars.right, cutout.right), Math.max(Math.max(bars.bottom, cutout.bottom), keyboard.bottom));
        Insets statusSpace = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.statusBars());
        int top = readingOverlay ? Math.max(statusSpace.top, cutout.top) : 0;
        if (top != chromeTop) {
            chromeTop = top;
            float density = content.getResources().getDisplayMetrics().density;
            String script = "document.documentElement.style.setProperty('--companion-system-chrome-top','"
                + (top / density) + "px')";
            webView.evaluateJavascript(script, null);
        }
        return new WindowInsetsCompat.Builder(insets)
            .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                | WindowInsetsCompat.Type.ime(), Insets.NONE).build();
    }
}
