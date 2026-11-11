package com.foliole.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import androidx.core.content.IntentCompat;

import java.util.ArrayList;

public final class FolioleReminderSnoozeActivity extends Activity {
    private AlertDialog panel;

    static PendingIntent open(Context context, int id, Uri occurrence, String title, ArrayList<String> labels,
                              ArrayList<PendingIntent> choices) {
        Intent intent = new Intent(context, FolioleReminderSnoozeActivity.class)
            .setData(occurrence)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK)
            .putExtra("title", title)
            .putStringArrayListExtra("labels", labels)
            .putParcelableArrayListExtra("choices", choices);
        return PendingIntent.getActivity(context, id, intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent intent = getIntent();
        ArrayList<String> labels = intent.getStringArrayListExtra("labels");
        ArrayList<PendingIntent> choices = IntentCompat.getParcelableArrayListExtra(intent, "choices", PendingIntent.class);
        if (labels == null || choices == null || labels.isEmpty() || labels.size() != choices.size()) {
            finish();
            return;
        }

        panel = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(intent.getStringExtra("title"))
            .setItems(labels.toArray(new String[0]), (dialog, choice) -> sendChoice(choices.get(choice)))
            .setNegativeButton(android.R.string.cancel, null)
            .create();
        panel.setOnDismissListener(dialog -> finish());
        panel.show();
    }

    @Override protected void onDestroy() {
        if (panel != null) {
            panel.setOnDismissListener(null);
            panel.dismiss();
        }
        super.onDestroy();
    }

    private void sendChoice(PendingIntent choice) {
        try {
            choice.send();
        } catch (PendingIntent.CanceledException error) {
            Log.w("FolioleReminder", "Could not send reminder choice", error);
        }
    }
}
