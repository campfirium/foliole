package com.foliole.android;

import android.annotation.SuppressLint;
import android.content.Context;
import android.util.AttributeSet;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;

import com.getcapacitor.CapacitorWebView;

@SuppressLint("Instantiatable")
public class FolioleCompanionWebView extends CapacitorWebView {

    public FolioleCompanionWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback) {
        return super.startActionMode(createSelectionActionModeCallback(callback));
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        return super.startActionMode(createSelectionActionModeCallback(callback), type);
    }

    private void reportSelectionAction(String phase, boolean created, long occurredAt) {
        evaluateJavascript("document.dispatchEvent(new CustomEvent('foliole-android-selection-action',{detail:{phase:'"
            + phase + "',created:" + created + ",occurredAt:" + occurredAt + "}}))", null);
    }

    private ActionMode.Callback createSelectionActionModeCallback(ActionMode.Callback callback) {
        // Editable fields keep WebView's clipboard actions and floating-menu positioning.
        if (onCheckIsTextEditor()) return callback;
        return new ActionMode.Callback() {
            @Override
            public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                boolean created = callback.onCreateActionMode(mode, menu);
                menu.clear();
                reportSelectionAction("create", created, System.currentTimeMillis());
                return created;
            }

            @Override
            public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                boolean prepared = callback.onPrepareActionMode(mode, menu);
                menu.clear();
                return prepared;
            }

            @Override
            public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                return callback.onActionItemClicked(mode, item);
            }

            @Override
            public void onDestroyActionMode(ActionMode mode) {
                long occurredAt = System.currentTimeMillis();
                callback.onDestroyActionMode(mode);
                reportSelectionAction("destroy", false, occurredAt);
            }
        };
    }
}
