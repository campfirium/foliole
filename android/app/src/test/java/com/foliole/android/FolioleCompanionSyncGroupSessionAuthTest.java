package com.foliole.android;

import static org.junit.Assert.*;
import java.lang.reflect.Field;
import java.util.Map;
import org.junit.Test;

public final class FolioleCompanionSyncGroupSessionAuthTest {
    @Test public void rejectedMemberStateRevokesOnlyAuthenticatedPeersPriorApproval() throws Exception {
        var auth = new FolioleCompanionSyncGroupSessionAuth(null, "group", null);
        Map<String, String> approvals = approvals(auth);
        approvals.put("rejected-peer", "restore");
        approvals.put("other-peer", "restore");
        auth.update("rejected-peer", null);
        assertFalse(approvals.containsKey("rejected-peer"));
        assertEquals("restore", approvals.get("other-peer"));
        auth.update("rejected-peer", null);
        assertEquals(1, approvals.size());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> approvals(FolioleCompanionSyncGroupSessionAuth auth) throws Exception {
        Field field = FolioleCompanionSyncGroupSessionAuth.class.getDeclaredField("ready");
        field.setAccessible(true);
        return (Map<String, String>) field.get(auth);
    }
}
