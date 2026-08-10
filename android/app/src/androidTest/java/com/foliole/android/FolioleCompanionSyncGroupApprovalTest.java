package com.foliole.android;

import android.app.Instrumentation;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncGroupApprovalTest {
    @Test
    public void approvesJoinWhileProviderStaysForeground() throws Exception {
        emit(FolioleCompanionSyncGroupApprovalScenario.approveForeground(
            InstrumentationRegistry.getInstrumentation()
        ));
        Thread.sleep(TimeUnit.MINUTES.toMillis(3));
    }

    @Test
    public void approvesJoinAndResumesProviderAfterBackgroundPause() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        emit(FolioleCompanionSyncGroupApprovalScenario.run(instrumentation));
    }

    private static void emit(JSONObject receipt) {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle evidence = new Bundle();
        evidence.putString("folioleSyncGroupApprovalReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }
}
