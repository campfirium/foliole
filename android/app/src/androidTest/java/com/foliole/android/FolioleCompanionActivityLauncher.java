package com.foliole.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;

final class FolioleCompanionActivityLauncher {
    private FolioleCompanionActivityLauncher() {}

    static Activity start(Instrumentation instrumentation, long timeoutMs) {
        Context context = instrumentation.getTargetContext();
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(
            context.getPackageName()
        );
        if (intent == null) throw new IllegalStateException("Main launch intent is missing.");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(
            intent.getComponent().getClassName(), null, false
        );
        context.startActivity(intent);
        Activity activity = instrumentation.waitForMonitorWithTimeout(monitor, timeoutMs);
        if (activity == null) {
            instrumentation.removeMonitor(monitor);
            throw new IllegalStateException("Timed out waiting for the main Activity launch.");
        }
        return activity;
    }
}
