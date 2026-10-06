package com.foliole.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import com.foliole.android.framed.FramedSyncPayload;
import com.foliole.android.framed.FramedSyncValidatedMessage;
import com.foliole.sync.v22.DifferenceRequest;
import com.foliole.sync.v22.FactKind;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public final class FolioleCompanionFramedSyncPullInputTest {
    @Test public void projectsNodeDifferenceWithTheInventoryRoundIdentity() throws Exception {
        byte[] roundId = bytes(16, 1);
        byte[] resourceHash = bytes(32, 2);
        FolioleCompanionFramedSyncPullInput.Request input =
            new FolioleCompanionFramedSyncPullInput.Request(
                "node-1", roundId, Arrays.asList("version-2", "version-1"),
                Collections.singletonList("[\"version-2\",\"version-1\",2]"),
                Collections.singletonList(resourceHash),
                Collections.singletonList("review-1"), Collections.singletonList("node_reading:" + "a".repeat(64)));

        List<FramedSyncValidatedMessage> messages =
            FolioleCompanionFramedSyncPullInput.messages(input);
        DifferenceRequest request = (DifferenceRequest) messages.get(0).payload().value();

        assertEquals(1, messages.size());
        assertEquals(FramedSyncPayload.Case.DIFFERENCE_REQUEST,
            messages.get(0).payload().payloadCase());
        assertArrayEquals(roundId, request.getRoundId().toByteArray());
        assertEquals(5, request.getFactsCount());
        assertEquals(FactKind.FACT_KIND_OBJECT_STATE, request.getFacts(4).getKind());
        assertEquals(FactKind.FACT_KIND_NODE_VERSION, request.getFacts(0).getKind());
        assertEquals(FactKind.FACT_KIND_PARENT_EDGE, request.getFacts(2).getKind());
        assertEquals(FactKind.FACT_KIND_REVIEW, request.getFacts(3).getKind());
        assertEquals("node", request.getFacts(0).getObjectType());
        assertEquals("node-1", request.getFacts(0).getGlobalId());
        assertArrayEquals(resourceHash, request.getBlobHashes(0).toByteArray());
    }

    private static byte[] bytes(int length, int value) {
        byte[] result = new byte[length];
        Arrays.fill(result, (byte) value);
        return result;
    }
}
