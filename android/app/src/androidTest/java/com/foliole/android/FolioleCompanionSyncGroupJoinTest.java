package com.foliole.android;

import android.app.Instrumentation;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncGroupJoinTest {
    @Test
    public void joinsDiscoveredGroupAndPersistsAfterRestart() throws Exception {
        JSONObject receipt = FolioleCompanionSyncGroupJoinScenario.run(
            InstrumentationRegistry.getInstrumentation()
        );
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle evidence = new Bundle();
        evidence.putString("folioleSyncGroupJoinReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }
}
