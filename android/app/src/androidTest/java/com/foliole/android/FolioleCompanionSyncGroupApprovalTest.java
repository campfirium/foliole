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
    public void approvesJoinAndResumesProviderAfterBackgroundPause() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        JSONObject receipt = FolioleCompanionSyncGroupApprovalScenario.run(instrumentation);
        Bundle evidence = new Bundle();
        evidence.putString("folioleSyncGroupApprovalReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }
}
