package com.foliole.android;

import android.app.Activity;
import android.view.WindowManager;

import java.lang.ref.WeakReference;

final class FolioleCompanionSyncScreenAwake {
    private static WeakReference<Activity> activity = new WeakReference<>(null);
    private static boolean held;

    private FolioleCompanionSyncScreenAwake() {}

    static synchronized void attach(Activity next) {
        activity = new WeakReference<>(next);
    }

    /** The renderer owns the hold for the duration of a request sync round. */
    static synchronized void hold(Activity next, boolean active) {
        if (next != null) activity = new WeakReference<>(next);
        held = active;
        apply(active);
    }

    /** Provider shutdown must not drop a hold owned by an active request sync round. */
    static synchronized void clear() {
        if (!held) apply(false);
    }

    private static void apply(boolean active) {
        Activity current = activity.get();
        if (current == null) return;
        current.runOnUiThread(() -> {
            if (active) current.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else current.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
}
