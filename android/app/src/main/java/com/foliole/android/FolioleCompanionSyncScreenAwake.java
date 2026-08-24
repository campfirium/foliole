package com.foliole.android;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;

import java.lang.ref.WeakReference;

final class FolioleCompanionSyncScreenAwake {
    private static final long IDLE_CLEAR_MS = 45_000;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static WeakReference<Activity> activity = new WeakReference<>(null);
    private static final Runnable CLEAR = FolioleCompanionSyncScreenAwake::clearNow;

    private FolioleCompanionSyncScreenAwake() {}

    static synchronized void attach(Activity next) {
        activity = new WeakReference<>(next);
    }

    static synchronized void touch() {
        Activity current = activity.get();
        if (current == null) return;
        current.runOnUiThread(() -> {
            current.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            MAIN.removeCallbacks(CLEAR);
            MAIN.postDelayed(CLEAR, IDLE_CLEAR_MS);
        });
    }

    static synchronized void clear() {
        MAIN.removeCallbacks(CLEAR);
        clearNow();
    }

    private static synchronized void clearNow() {
        Activity current = activity.get();
        if (current != null) current.runOnUiThread(() ->
            current.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    }
}
