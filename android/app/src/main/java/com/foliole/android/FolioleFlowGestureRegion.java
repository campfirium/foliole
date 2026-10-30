package com.foliole.android;

import android.graphics.Rect;
import android.os.Build;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

final class FolioleFlowGestureRegion {
    private final View host;
    private final View webView;
    private final float density;
    private boolean enabled;
    private boolean observing;
    private double width;
    private double height;
    private double viewportWidth;
    private final View.OnLayoutChangeListener layoutListener =
        (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> apply();

    FolioleFlowGestureRegion(View host, View webView, float density) {
        this.host = host;
        this.webView = webView;
        this.density = density;
    }

    void set(boolean enabled, double width, double height, double viewportWidth) {
        this.enabled = enabled;
        this.width = width;
        this.height = height;
        this.viewportWidth = viewportWidth;
        observeLayout(enabled);
        apply();
    }

    private void observeLayout(boolean active) {
        if (observing == active) return;
        observing = active;
        if (active) {
            host.addOnLayoutChangeListener(layoutListener);
            webView.addOnLayoutChangeListener(layoutListener);
        } else {
            host.removeOnLayoutChangeListener(layoutListener);
            webView.removeOnLayoutChangeListener(layoutListener);
        }
    }

    private void apply() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        List<Rect> regions = new ArrayList<>();
        if (enabled && webView.getWidth() > 0 && webView.getHeight() > 0) {
            int[] hostPosition = new int[2];
            int[] webPosition = new int[2];
            host.getLocationInWindow(hostPosition);
            webView.getLocationInWindow(webPosition);
            int left = webPosition[0] - hostPosition[0];
            int offsetY = webPosition[1] - hostPosition[1];
            float scale = webView.getWidth() / (float) viewportWidth;
            int edge = Math.min(webView.getWidth() / 2, Math.round((float) width * scale));
            int band = Math.min(webView.getHeight(), Math.min(Math.round((float) height * scale),
                Math.round(200 * density)));
            int top = offsetY + (webView.getHeight() - band) / 2;
            addClipped(regions, new Rect(left, top, left + edge, top + band));
            int right = left + webView.getWidth();
            addClipped(regions, new Rect(right - edge, top, right, top + band));
        }
        // WebView owns its own exclusion list for selection handles; keep Flow on the host.
        host.setSystemGestureExclusionRects(regions);
    }

    private void addClipped(List<Rect> regions, Rect rect) {
        if (rect.intersect(0, 0, host.getWidth(), host.getHeight())) regions.add(rect);
    }

    void dispose() {
        enabled = false;
        observeLayout(false);
        apply();
    }
}
