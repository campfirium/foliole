package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionWorkspaceSyncStateTest {
    private Context context;
    private FolioleCompanionDatabaseHelper helper;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
        helper = new FolioleCompanionDatabaseHelper(context);
    }

    @After
    public void tearDown() {
        if (helper != null) {
            helper.close();
        }
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
    }

    @Test
    public void completedSyncEventPersistsLastSyncedAt() throws Exception {
        JSObject completed = helper.recordWorkspaceSyncEvent(
            "http://10.0.2.2:38641",
            "completed",
            "Sync completed.",
            "2026-05-01T02:00:00.000Z"
        );
        JSObject checked = helper.recordWorkspaceSyncEvent(
            "http://10.0.2.2:38641",
            "skipped",
            "Some topic bodies are still being cached.",
            "2026-05-01T02:01:00.000Z"
        );

        assertEquals("2026-05-01T02:00:00.000Z", completed.getString("last_synced_at"));
        assertEquals("2026-05-01T02:00:00.000Z", checked.getString("last_synced_at"));
    }
}
