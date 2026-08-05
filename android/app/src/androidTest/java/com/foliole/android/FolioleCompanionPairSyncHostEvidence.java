package com.foliole.android;

import android.app.Instrumentation;
import android.os.Bundle;

final class FolioleCompanionPairSyncHostEvidence {
    private FolioleCompanionPairSyncHostEvidence() {}

    static void stage(Instrumentation instrumentation, String stage) {
        Bundle evidence = new Bundle();
        evidence.putString("foliolePairSyncStage", stage);
        instrumentation.sendStatus(2, evidence);
    }
}
