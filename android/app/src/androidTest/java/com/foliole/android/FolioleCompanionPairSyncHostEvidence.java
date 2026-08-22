package com.foliole.android;

import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;

import androidx.test.platform.app.InstrumentationRegistry;

import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

final class FolioleCompanionPairSyncHostEvidence {
    static final String STAGE_FILE = "foliole-pair-sync-stage.txt";

    private FolioleCompanionPairSyncHostEvidence() {}

    static void stage(Instrumentation instrumentation, String stage) {
        persistStage(instrumentation, stage);
        Bundle evidence = new Bundle();
        evidence.putString("foliolePairSyncStage", stage);
        instrumentation.sendStatus(2, evidence);
    }

    private static void persistStage(Instrumentation instrumentation, String stage) {
        String runId = InstrumentationRegistry.getArguments().getString("foliolePairSyncRunId", "");
        if (runId.isEmpty()) return;
        String value = runId + "\n" + stage + "\n";
        try (FileOutputStream output = instrumentation.getContext().openFileOutput(
            STAGE_FILE, Context.MODE_PRIVATE
        )) {
            output.write(value.getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) { /* sendStatus remains the primary evidence channel. */ }
    }
}
