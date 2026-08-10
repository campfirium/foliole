package com.foliole.android;

import android.app.Instrumentation;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncGroupApprovalTest {
    @Test
    public void approvesJoinWhileProviderStaysForeground() throws Exception {
        emit(FolioleCompanionSyncGroupApprovalScenario.approveForeground(
            InstrumentationRegistry.getInstrumentation()
        ));
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
