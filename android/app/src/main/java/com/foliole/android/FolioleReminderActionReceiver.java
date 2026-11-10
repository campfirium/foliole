package com.foliole.android;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public final class FolioleReminderActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        long actionAt = System.currentTimeMillis();
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                String action = intent.getAction();
                if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                    || AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) {
                    FolioleReminderAlarm.restore(context);
                } else {
                    FolioleReminderAlarm.handle(context, intent, actionAt);
                }
            } catch (Exception error) {
                Log.w("FolioleReminder", "Could not complete reminder notification action", error);
            } finally {
                result.finish();
            }
        }, "foliole-reminder-action").start();
    }
}
