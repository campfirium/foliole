package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FolioleS220NetworkTest {
    @Test public void disconnectOnly() throws Exception { change(false); }
    @Test public void restoreOnly() throws Exception { change(true); }

    private void change(boolean restore) throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.foliole.android.s220acceptance", context.getPackageName());
        JSONObject network = restore
            ? FolioleArticleImageTestNetwork.restore(context)
            : FolioleArticleImageTestNetwork.disconnect(context);
        Bundle receipt = new Bundle();
        receipt.putString("folioleNetwork", network.toString());
        InstrumentationRegistry.getInstrumentation().sendStatus(2, receipt);
    }
}
