package com.foliole.android;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.time.Instant;

@CapacitorPlugin(name = "FolioleCompanionBootstrap")
public class FolioleCompanionBootstrapPlugin extends Plugin {

    @PluginMethod
    public void setAppearance(PluginCall call) {
        String background = call.getString("backgroundColor");
        if (background == null || !background.matches("#[0-9a-fA-F]{6}")) {
            call.reject("Invalid appearance background color.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            int color = android.graphics.Color.parseColor(background);
            getActivity().getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(color));
            getActivity().findViewById(android.R.id.content).setBackgroundColor(color);
            getBridge().getWebView().setBackgroundColor(color);
            call.resolve();
        });
    }

    @PluginMethod
    public void readClipboardText(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                android.content.ClipboardManager clipboard = (android.content.ClipboardManager)
                    getContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                if (clipboard == null) {
                    call.reject("Text clipboard is unavailable.");
                    return;
                }
                android.content.ClipData clip = clipboard.getPrimaryClip();
                CharSequence text = clip == null || clip.getItemCount() == 0 ? null : clip.getItemAt(0).getText();
                com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
                result.put("text", text == null ? "" : text.toString());
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Could not read the clipboard.", exception);
            }
        });
    }

    @PluginMethod
    public void setFlowGestureRegion(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        Double width = call.getDouble("edgeWidth");
        Double height = call.getDouble("bandHeight");
        Double viewportWidth = call.getDouble("viewportWidth");
        if (enabled == null || width == null || height == null || viewportWidth == null
            || !Double.isFinite(width) || !Double.isFinite(height) || !Double.isFinite(viewportWidth)
            || width <= 0 || width > 48 || height <= 0 || height > 200 || viewportWidth <= 0) {
            call.reject("Invalid Flow gesture region.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            android.webkit.WebView view = getBridge().getWebView();
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                java.util.List<android.graphics.Rect> regions = new java.util.ArrayList<>();
                if (enabled) {
                    float scale = view.getWidth() / viewportWidth.floatValue();
                    int edge = Math.min(view.getWidth() / 2, Math.round(width.floatValue() * scale));
                    int band = Math.min(view.getHeight(), Math.min(Math.round(height.floatValue() * scale),
                        Math.round(200 * getContext().getResources().getDisplayMetrics().density)));
                    int top = (view.getHeight() - band) / 2;
                    regions.add(new android.graphics.Rect(0, top, edge, top + band));
                    regions.add(new android.graphics.Rect(view.getWidth() - edge, top, view.getWidth(), top + band));
                }
                view.setSystemGestureExclusionRects(regions);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void loadBootstrap(PluginCall call) {
        try {
            FolioleCompanionBootstrapState state = new FolioleCompanionBootstrapState(
                getContext(), Instant.now().toString(), null, false
            );
            call.resolve(state.toJsObject());
        } catch (Exception exception) {
            call.reject("Failed to bootstrap Foliole companion runtime.", exception);
        }
    }
}
