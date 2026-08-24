package com.foliole.android;

import android.app.Instrumentation;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncGroupApprovalTest {
    @Test
    public void approvesJoinWhileProviderStaysForeground() throws Exception {
        emit(FolioleCompanionSyncGroupApprovalScenario.approveForeground(
            InstrumentationRegistry.getInstrumentation(),
            FolioleCompanionSyncGroupApprovalTest::emitReady
        ));
        new CountDownLatch(1).await();
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

    private static void emitReady() {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle evidence = new Bundle();
        evidence.putString("folioleSyncGroupApprovalReady", "provider-listener-ready");
        instrumentation.sendStatus(2, evidence);
    }
}
