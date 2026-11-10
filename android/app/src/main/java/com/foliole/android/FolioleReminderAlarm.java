package com.foliole.android;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;

import net.zetetic.database.sqlcipher.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Map;

final class FolioleReminderAlarm {
    private static final String STORAGE = "foliole-reminder-deliveries";
    private static final int FIRST_JOB_ID = 650_000_000;
    private static final int END_JOB_ID = 700_000_000;
    private static final String CONTRACT = "reminderBackgroundAction";
    static final String DELIVER = "com.foliole.android.reminder.DELIVER";
    static final String SNOOZE = "com.foliole.android.reminder.SNOOZE";
    static final String DISMISS = "com.foliole.android.reminder.DISMISS";

    private FolioleReminderAlarm() {}

    private static SharedPreferences store(Context context) {
        return context.getSharedPreferences(STORAGE, Context.MODE_PRIVATE);
    }

    private static JSONObject job(Context context, int id) throws Exception {
        String value = store(context).getString(Integer.toString(id), null);
        return value == null ? null : new JSONObject(value);
    }

    static synchronized JSONArray jobs(Context context) throws Exception {
        JSONArray result = new JSONArray();
        for (Object value : store(context).getAll().values()) {
            result.put(new JSONObject((String) value));
        }
        return result;
    }

    static synchronized void schedule(Context context, JSONObject job) throws Exception {
        int id = job.getInt("id");
        requireJobId(id);
        if (!authorizes(context, job)) throw new IllegalStateException("Reminder rule is no longer current.");
        JSONObject previous = job(context, id);
        write(context, job);
        try {
            arm(context, job);
        } catch (RuntimeException error) {
            if (previous == null) forget(context, id);
            else write(context, previous);
            throw error;
        }
    }

    private static void write(Context context, JSONObject job) throws Exception {
        if (!store(context).edit().putString(Integer.toString(job.getInt("id")), job.toString()).commit()) {
            throw new IllegalStateException("Could not persist reminder delivery.");
        }
    }

    private static void forget(Context context, int id) {
        if (!store(context).edit().remove(Integer.toString(id)).commit()) {
            throw new IllegalStateException("Could not cancel reminder delivery.");
        }
    }

    private static void requireJobId(int id) {
        if (id < FIRST_JOB_ID || id >= END_JOB_ID) throw new IllegalArgumentException("Invalid reminder job identifier.");
    }

    static synchronized void cancel(Context context, int id) {
        requireJobId(id);
        forget(context, id);
        PendingIntent alarm = PendingIntent.getBroadcast(context, id, intent(context, id, DELIVER),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_NO_CREATE);
        if (alarm != null) {
            context.getSystemService(AlarmManager.class).cancel(alarm);
            alarm.cancel();
        }
        context.getSystemService(NotificationManager.class).cancel(id);
    }

    private static Intent intent(Context context, int id, String action) {
        return new Intent(context, FolioleReminderActionReceiver.class).setAction(action).putExtra("id", id);
    }

    private static void arm(Context context, JSONObject job) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
            throw new SecurityException("Exact reminder alarms are disabled.");
        }
        int id = job.optInt("id");
        PendingIntent alarm = PendingIntent.getBroadcast(context, id, intent(context, id, DELIVER),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, job.optLong("at"), alarm);
    }

    static synchronized void restore(Context context) throws Exception {
        for (Map.Entry<String, ?> entry : store(context).getAll().entrySet()) {
            JSONObject job = new JSONObject((String) entry.getValue());
            if (!job.optBoolean("delivered")) arm(context, job);
        }
    }

    static synchronized void handle(Context context, Intent intent, long actionAt) throws Exception {
        int id = intent.getIntExtra("id", -1);
        JSONObject job = job(context, id);
        if (job == null) return;
        String action = intent.getAction();
        if (DELIVER.equals(action)) {
            if (job.optBoolean("delivered") || job.getLong("at") > actionAt) return;
            if (!authorizes(context, job)) { cancel(context, id); return; }
            post(context, job);
            job.put("delivered", true);
            write(context, job);
            return;
        }
        if (!job.optBoolean("delivered") || intent.getLongExtra("at", -1) != job.getLong("at")
            || !job.getString("revision").equals(intent.getStringExtra("revision"))) return;
        if (DISMISS.equals(action)) { cancel(context, id); return; }
        if (!SNOOZE.equals(action)) return;
        JSONObject contract = FolioleCompanionBridgeContractAsset.hostApiGroup(context, CONTRACT);
        int minutes = contract.getJSONObject("minutes").optInt(intent.getStringExtra("choice"));
        if (minutes <= 0 || !authorizes(context, job)) return;
        job.put("snoozedFrom", job.getLong("at"));
        job.put("at", actionAt + minutes * 60_000L);
        job.put("delivered", false);
        schedule(context, job);
        context.getSystemService(NotificationManager.class).cancel(id);
    }

    private static boolean authorizes(Context context, JSONObject job) throws Exception {
        String name = FolioleCompanionBridgeContractAsset.hostApiGroup(context, "folderBackup").getString("databaseName");
        JSONObject contract = FolioleCompanionBridgeContractAsset.hostApiGroup(context, CONTRACT);
        if (!contract.getString("owner").equals(job.getString("owner"))) return false;
        String sql = contract.getString("authorizeSql");
        System.loadLibrary("sqlcipher");
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath(name + "SQLite.db").getPath(),
            "", null, SQLiteDatabase.OPEN_READONLY, null);
             Cursor cursor = db.rawQuery(sql, new String[] { job.getString("ruleId"), job.getString("revision") })) {
            return cursor.moveToFirst();
        }
    }

    private static PendingIntent action(Context context, JSONObject job, String action, String choice) throws Exception {
        int id = job.getInt("id");
        long at = job.getLong("at");
        String revision = job.getString("revision");
        Intent intent = intent(context, id, action).putExtra("at", at).putExtra("choice", choice).putExtra("revision", revision);
        intent.setData(Uri.parse("foliole-reminder:" + id + "/" + revision + "/" + at + "/" + choice));
        return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_IMMUTABLE);
    }

    private static void post(Context context, JSONObject job) throws Exception {
        int id = job.getInt("id");
        JSONObject extra = new JSONObject().put("owner", job.getString("owner"))
            .put("ruleId", job.getString("ruleId")).put("revision", job.getString("revision"));
        JSONObject payload = new JSONObject().put("id", id).put("extra", extra);
        Intent open = new Intent(context, MainActivity.class).setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, id)
            .putExtra(LocalNotificationManager.ACTION_INTENT_KEY, "tap")
            .putExtra(LocalNotificationManager.NOTIFICATION_OBJ_INTENT_KEY, payload.toString());
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, LocalNotificationManager.DEFAULT_NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Foliole")
            .setContentText(job.getString("body")).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
            .setDeleteIntent(action(context, job, DISMISS, "dismiss"));
        JSONArray actions = job.getJSONArray("actions");
        for (int i = 0; i < actions.length(); i++) {
            JSONObject action = actions.getJSONObject(i);
            notification.addAction(0, action.getString("title"), action(context, job, SNOOZE, action.getString("id")));
        }
        context.getSystemService(NotificationManager.class).notify(id, notification.build());
    }
}
