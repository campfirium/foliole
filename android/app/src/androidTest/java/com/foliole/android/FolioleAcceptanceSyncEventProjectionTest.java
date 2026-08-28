package com.foliole.android;

import android.app.Instrumentation;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleAcceptanceSyncEventProjectionTest {
    @Test public void projectsSyncEventsForAcceptance() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle evidence = new Bundle();
        evidence.putString("folioleAfterSemantic", new JSONObject().toString());
        evidence.putString("folioleActionReceipt", FolioleAcceptanceSyncEventProjection.read(
            instrumentation.getTargetContext()).toString());
        instrumentation.sendStatus(2, evidence);
    }
}
