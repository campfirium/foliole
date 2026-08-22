package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSystemEntryDisplayNameTest {
    private static final String INBOX_TEST_ID = "companion-directory-node-special-inbox";

    @Test
    public void displaysHydratedInboxNameAfterRestart() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bundle arguments = InstrumentationRegistry.getArguments();
        String expected = arguments.getString("expectedText", "");
        String forbidden = arguments.getString("forbiddenText", "");
        Activity activity = FolioleCompanionActivityLauncher.start(instrumentation, 30_000);
        try {
            WebView webView = activity.findViewById(R.id.webview);
            assertNotNull(webView);
            JSONObject sync = FolioleCompanionPairSyncRecoveryScenario.run(
                instrumentation, webView, false, false, "", 120_000
            );
            assertEquals(sync.toString(), "existing", sync.optString("pairingPath"));
            FolioleCompanionCaptureNavigation.openDirectorySurface(
                instrumentation, webView, 30_000
            );
            JSONObject displayed = readDisplayedInbox(instrumentation, webView);
            assertTrue(displayed.toString(), displayed.optBoolean("visible"));
            assertFalse(displayed.toString(), displayed.optString("text").isEmpty());
            if (!expected.isEmpty()) assertEquals(displayed.toString(), expected, displayed.optString("text"));
            if (!forbidden.isEmpty()) assertFalse(displayed.toString(), forbidden.equals(displayed.optString("text")));
            sendEvidence(instrumentation, displayed, expected, forbidden, sync);
        } finally {
            activity.runOnUiThread(activity::finish);
        }
    }

    private static JSONObject readDisplayedInbox(
        Instrumentation instrumentation,
        WebView webView
    ) throws Exception {
        return FolioleCompanionWebViewSemanticAdapter.evaluateJson(instrumentation, webView,
            "(function(){var node=document.querySelector('[data-testid=\"" + INBOX_TEST_ID +
                "\"]');var rect=node?node.getBoundingClientRect():null;return JSON.stringify({" +
                "language:document.documentElement.lang||'',text:node?(node.textContent||'').trim():''," +
                "visible:!!(node&&rect&&rect.width&&rect.height)});})()"
        );
    }

    private static void sendEvidence(
        Instrumentation instrumentation,
        JSONObject displayed,
        String expected,
        String forbidden,
        JSONObject sync
    ) throws Exception {
        JSONObject receipt = new JSONObject();
        receipt.put("displayed", displayed);
        receipt.put("expectedText", expected);
        receipt.put("forbiddenText", forbidden);
        receipt.put("hydratedAfterRestart", true);
        receipt.put("sync", sync);
        Bundle evidence = new Bundle();
        evidence.putString("folioleActionReceipt", receipt.toString());
        instrumentation.sendStatus(2, evidence);
    }
}
