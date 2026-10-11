package com.foliole.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Process;
import android.webkit.WebView;

import java.io.File;
import java.io.FileOutputStream;

final class FolioleCompanionJoinFailureEvidence {
    private FolioleCompanionJoinFailureEvidence() {}

    static void save(Instrumentation instrumentation, Activity activity) {
        if (!"com.campfirium.foliole.android.acceptance".equals(
            instrumentation.getTargetContext().getPackageName())) return;
        Bundle evidence = new Bundle();
        evidence.putString("folioleFailurePid", Integer.toString(Process.myPid()));
        try {
            WebView view = activity.findViewById(R.id.webview);
            evidence.putString("folioleFailurePage", FolioleCompanionWebViewSemanticAdapter.evaluateJson(
                instrumentation, view,
                "JSON.stringify({url:location.href,readyState:document.readyState," +
                "body:(document.body?.innerText||'').slice(0,4000)})").toString());
        } catch (Exception error) { evidence.putString("folioleFailurePageError", error.toString()); }
        try {
            Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
            if (bitmap == null) throw new IllegalStateException("Screenshot unavailable");
            File target = new File(instrumentation.getTargetContext().getExternalFilesDir(null),
                "join-failure.png");
            try (FileOutputStream output = new FileOutputStream(target)) {
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                    throw new IllegalStateException("Screenshot encoding failed");
                }
            } finally { bitmap.recycle(); }
            evidence.putString("folioleFailureScreenshot", "saved");
        } catch (Exception error) { evidence.putString("folioleFailureScreenshotError", error.toString()); }
        instrumentation.sendStatus(2, evidence);
    }
}
