package com.foliole.android;

import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.ServiceCompat;

/** Keeps the process eligible to run while a long request sync round continues off screen. */
public final class FolioleCompanionSyncBackgroundService extends Service {
    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            ServiceCompat.startForeground(this, FolioleCompanionSyncBackgroundWork.NOTIFICATION_ID,
                FolioleCompanionSyncBackgroundWork.notification(this), dataSyncType());
        } catch (RuntimeException error) {
            // Android refuses when the app is no longer visible or the daily dataSync time is used up.
            FolioleCompanionSyncBackgroundWork.ended("start_not_allowed");
            stopSelf();
            return START_NOT_STICKY;
        }
        FolioleCompanionSyncBackgroundWork.started(this);
        return START_NOT_STICKY;
    }

    @Override public void onTimeout(int startId, int foregroundServiceType) {
        FolioleCompanionSyncBackgroundWork.ended("time_limit");
        stopSelf();
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        FolioleCompanionSyncBackgroundWork.ended("task_removed");
        stopSelf();
    }

    @Override public void onDestroy() {
        FolioleCompanionSyncBackgroundWork.stopped(this);
        super.onDestroy();
    }

    private static int dataSyncType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0;
    }
}
