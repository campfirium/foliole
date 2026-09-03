package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionCompleteMemberDataPlaneTest {
    @Test
    public void projectsPreparedCapabilityWithoutChangingProductionV4() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        FolioleCompanionSyncPackProviderDefinitions definitions =
            FolioleCompanionSyncPackProviderDefinitions.load(context);
        JSONObject production = definitions.protocol();
        JSONObject prepared = definitions.preparedMemberDataPlane();
        JSONObject preparedProtocol = prepared.getJSONObject("protocol");

        assertEquals(4, production.getInt("version"));
        assertFalse(contains(production.getJSONArray("capabilities"), "complete-member-data-plane"));
        assertEquals(4, preparedProtocol.getInt("version"));
        assertTrue(contains(preparedProtocol.getJSONArray("capabilities"), "complete-member-data-plane"));
        assertTrue(contains(prepared.getJSONArray("resourceKinds"), "attachment"));
        assertTrue(contains(prepared.getJSONArray("resourceKinds"), "content_blob"));
    }

    private static boolean contains(JSONArray values, String expected) throws Exception {
        for (int index = 0; index < values.length(); index += 1) {
            if (expected.equals(values.getString(index))) return true;
        }
        return false;
    }
}
