package com.foliole.android;

import static org.junit.Assert.*;
import com.foliole.android.framed.FramedSyncPreamble;
import com.foliole.android.framed.FramedSyncWireHeader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import org.junit.Test;

public final class FolioleCompanionFramedSyncDependencyRetryTest {
    private static final List<String> DEPENDENCIES = List.of("framed_sync_node_parent_missing:",
        "node_position_lineage_unproven:", "parent_order_position_lineage_unproven:", "sync_parent_order_body_unavailable:",
            "framed_sync_review_node_missing:", "framed_sync_parent_relation_version_missing:");

    @Test public void failedBatchReplaysSameSealedUnitsRecoversOriginalReceiptAndContinuesParent() throws Exception {
        for (String prefix : DEPENDENCIES) {
            var units = List.of(new byte[] {1}, new byte[] {2}, new byte[] {3});
            var serverReceipts = new HashMap<byte[], byte[]>();
            var completed = new HashMap<byte[], byte[]>();
            var attempts = new ArrayList<List<byte[]>>();
            var deferred = new ArrayList<byte[]>();
            FolioleCompanionFramedSyncBatchOutbound.deliverWithDependencyRetry(units, completed::containsKey, batch -> {
                attempts.add(List.copyOf(batch));
                for (byte[] unit : batch) {
                    if (unit == units.get(1)) throw new Exception("framed_sync_http_400:" + prefix + "parent");
                    serverReceipts.computeIfAbsent(unit, ignored -> new byte[] {unit[0], 9});
                }
                // A batch response is emitted only after every remote apply succeeds.
                for (byte[] unit : batch) completed.put(unit, serverReceipts.get(unit));
            }, (unit, error) -> deferred.add(unit));
            assertEquals(List.of(units, List.of(units.get(0)), List.of(units.get(1)), List.of(units.get(2))), attempts);
            assertEquals(List.of(units.get(1)), deferred);
            assertSame(serverReceipts.get(units.get(0)), completed.get(units.get(0)));
            assertEquals(2, completed.size());
            assertSame(units.get(0), attempts.get(1).get(0));
        }
    }

    @Test public void alreadyCommittedReceiptIsSkippedAndNonDependencyFailuresNeverRetry() throws Exception {
        var completed = new ArrayList<Integer>();
        var attempts = new ArrayList<List<Integer>>();
        FolioleCompanionFramedSyncBatchOutbound.deliverWithDependencyRetry(List.of(1, 2), completed::contains, batch -> {
            attempts.add(batch);
            if (batch.size() > 1) {
                completed.add(1);
                throw new Exception("framed_sync_node_parent_missing:parent");
            }
            completed.addAll(batch);
        }, (unit, error) -> fail("independent single must succeed"));
        assertEquals(List.of(List.of(1, 2), List.of(2)), attempts);
        for (String code : List.of("authentication_failed", "receipt_identity_conflict", "framed_sync_frame_truncated",
            "receipt_identity_conflict:framed_sync_node_parent_missing:parent",
            "aead_failed:node_position_lineage_unproven:parent",
            "framed_sync_http_401:sync_parent_order_body_unavailable:parent",
            "framed_sync_http_400:framed_sync_node_parent_missing:parent extra",
            "framed_sync_node_parent_missing:", "framed_sync_node_parent_missing:parent\n")) {
            attempts.clear();
            try {
                FolioleCompanionFramedSyncBatchOutbound.deliverWithDependencyRetry(List.of(1, 2), ignored -> false,
                    batch -> { attempts.add(batch); throw new Exception(code); }, (unit, error) -> fail("must not defer"));
                fail("must throw");
            } catch (Exception error) { assertEquals(code, error.getMessage()); }
            assertEquals(1, attempts.size());
        }
    }

    @Test public void pullReturnsOnlyAckCompletedPrefixOnKnownDependency() throws Exception {
        byte[] body = sequence();
        for (String prefix : DEPENDENCIES) {
            var acknowledged = new ArrayList<Integer>();
            var received = FolioleCompanionFramedSyncPullBatch.receiveAcknowledgedPrefix(new ByteArrayInputStream(body), 2,
                (unit, index) -> {
                    unit.readAllBytes();
                    if (index == 1) throw new Exception(prefix + "parent");
                    acknowledged.add(index);
                    return index;
                });
            assertEquals(List.of(0), received);
            assertEquals(received, acknowledged);
            try {
                FolioleCompanionFramedSyncPullBatch.receiveAcknowledgedPrefix(new ByteArrayInputStream(body), 2,
                    (unit, index) -> { throw new Exception(prefix + "parent"); });
                fail("first dependency must throw");
            } catch (Exception error) { assertEquals(prefix + "parent", error.getMessage()); }
        }
    }

    @Test public void pullDoesNotHideIdentityTruncationOrAckFailure() throws Exception {
        for (String code : List.of("receipt_identity_conflict", "authentication_failed", "ack_failed",
            "receipt_identity_conflict:framed_sync_node_parent_missing:parent",
            "aead_failed:node_position_lineage_unproven:parent",
            "framed_sync_http_401:sync_parent_order_body_unavailable:parent",
            "framed_sync_http_400:framed_sync_node_parent_missing:parent extra",
            "framed_sync_node_parent_missing:", "framed_sync_node_parent_missing:parent\n")) {
            try {
                FolioleCompanionFramedSyncPullBatch.receiveAcknowledgedPrefix(new ByteArrayInputStream(sequence()), 2,
                    (unit, index) -> { unit.readAllBytes(); if (index == 1) throw new Exception(code); return index; });
                fail("must throw");
            } catch (Exception error) { assertEquals(code, error.getMessage()); }
        }
        byte[] body = sequence();
        try {
            FolioleCompanionFramedSyncPullBatch.receiveAcknowledgedPrefix(
                new ByteArrayInputStream(java.util.Arrays.copyOf(body, body.length - 1)), 2,
                (unit, index) -> { unit.readAllBytes(); return index; });
            fail("truncated second unit must throw");
        } catch (Exception error) { assertEquals("framed_sync_frame_truncated", error.getMessage()); }
    }

    private static byte[] sequence() throws Exception {
        var output = new ByteArrayOutputStream();
        for (int id = 1; id <= 2; id++) {
            byte[] identity = new byte[32]; identity[0] = (byte) id;
            output.write(FramedSyncPreamble.transfer(identity, new byte[16], new byte[4]).encoded());
            output.write(FramedSyncWireHeader.encode(16, 0, 2)); output.write(new byte[16]);
            output.write(FramedSyncWireHeader.encode(16, 1, 5)); output.write(new byte[16]);
        }
        return output.toByteArray();
    }
}
