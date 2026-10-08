package com.foliole.android;

import static org.junit.Assert.*;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferManifest;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public final class FolioleCompanionFramedSyncRequestedFactsTest {
    @Test public void requiresTheCompleteFrozenVersionFrontier() throws Exception {
        var request = request("node", "first", List.of("version-a", "version-b"), Collections.emptyList());
        FolioleCompanionFramedSyncRequestedFacts.require(request, header("node", "first", 2, "version-b", "version-a"));
        reject(request, header("node", "first", 2, "version-a"));
        reject(request, header("node", "first", 2, "version-a", "version-a"));
        reject(request, header("node", "second", 2, "version-a", "version-b"));
        reject(request, header("setting", "first", 1, "version-a", "version-b"));
    }

    @Test public void requiresOriginalSettingFactIdentityAndRejectsUnexpectedExtraFact() throws Exception {
        var request = request("setting", "profile", Collections.emptyList(), List.of("state-original"));
        FolioleCompanionFramedSyncRequestedFacts.require(request, header("setting", "profile", 1, "state-original"));
        reject(request, header("setting", "profile", 1, "state-other"));
        reject(request, header("setting", "profile", 1, "state-original", "extra"));
    }

    private static FolioleCompanionFramedSyncPullInput.Request request(String type, String id,
        List<String> versions, List<String> states) {
        return new FolioleCompanionFramedSyncPullInput.Request(id, type, new byte[16], versions,
            Collections.emptyList(), Collections.emptyList(), Collections.emptyList(), states);
    }

    private static TransferHeader header(String type, String id, int kind, String... facts) {
        var manifest = TransferManifest.newBuilder();
        for (String fact : facts) manifest.addFacts(FactDescriptor.newBuilder().setIdentity(FactIdentity.newBuilder()
            .setKindValue(kind).setObjectType(type).setGlobalId(id).setFactId(fact)));
        return TransferHeader.newBuilder().setManifest(manifest).build();
    }

    private static void reject(FolioleCompanionFramedSyncPullInput.Request request, TransferHeader header) throws Exception {
        try { FolioleCompanionFramedSyncRequestedFacts.require(request, header); fail("mismatching original facts must reject"); }
        catch (IllegalArgumentException expected) { assertEquals("framed_sync_requested_fact_set_mismatch", expected.getMessage()); }
    }
}
