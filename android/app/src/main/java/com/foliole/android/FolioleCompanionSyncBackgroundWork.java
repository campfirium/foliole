package com.foliole.android;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.function.Consumer;

/** Owns the dataSync foreground service; the renderer decides when a round is long enough to need it. */
final class FolioleCompanionSyncBackgroundWork {
    static final int NOTIFICATION_ID = 4096;
    private static final String CHANNEL_ID = "foliole_sync_progress";
    private static Consumer<String> endedListener = reason -> {};
    private static FolioleCompanionSyncBackgroundService service;
    private static boolean requested;
    private static String title = "";
    private static String text = "";
    private static int completed = -1;
    private static int total = -1;

    private FolioleCompanionSyncBackgroundWork() {}

    static synchronized void listen(Consumer<String> listener) {
        endedListener = listener;
    }

    static synchronized void begin(Context context, String nextTitle, String nextText, String channelName) {
        createChannel(context, channelName);
        title = nextTitle; text = nextText; completed = -1; total = -1;
        // Throws ForegroundServiceStartNotAllowedException once the app is no longer visible.
        ContextCompat.startForegroundService(context, new Intent(context, FolioleCompanionSyncBackgroundService.class));
        requested = true;
    }

    static synchronized void update(Context context, String nextTitle, String nextText, int nextCompleted, int nextTotal) {
        title = nextTitle; text = nextText; completed = nextCompleted; total = nextTotal;
        if (service == null || !canNotify(context)) return;
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification(context));
        } catch (SecurityException ignored) {
        }
    }

    static synchronized void end() {
        requested = false;
        if (service != null) service.stopSelf();
    }

    static synchronized void started(FolioleCompanionSyncBackgroundService next) {
        service = next;
        // The renderer may have finished before Android delivered the start command.
        if (!requested) next.stopSelf();
    }

    static synchronized void stopped(FolioleCompanionSyncBackgroundService previous) {
        if (service == previous) service = null;
    }

    static synchronized void ended(String reason) {
        if (!requested) return;
        requested = false;
        endedListener.accept(reason);
    }

    static synchronized Notification notification(Context context) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openApp(context));
        if (total > 0) builder.setProgress(total, Math.max(0, Math.min(total, completed)), false);
        else builder.setProgress(0, 0, true);
        return builder.build();
    }

    private static PendingIntent openApp(Context context) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        return launch == null ? null : PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE);
    }

    private static boolean canNotify(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static void createChannel(Context context, String name) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
}
