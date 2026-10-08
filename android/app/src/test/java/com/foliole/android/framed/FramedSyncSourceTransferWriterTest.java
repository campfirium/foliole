package com.foliole.android.framed;

import static org.junit.Assert.*;

import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public final class FramedSyncSourceTransferWriterTest {
    @Test public void preservesOriginalGoldenFactBytesInFrozenSource() throws Exception {
        for (var vector : FramedSyncContractSource.messages()) {
            if (!vector.payloadCase.equals("fact")) continue;
            FactRecord fact = ProtocolMessage.parseFrom(vector.bytes).getFact();
            var source = new FramedSyncSourceWriterFixture(Collections.singletonList(fact));
            source.messages.get(0).set(0, vector.bytes);
            File directory = Files.createTempDirectory("framed-source-golden-").toFile();
            try {
                try (var spool = new FramedSyncOutboundFactSpool(directory)) {
                    assertEquals(fact, spool.freeze(source, 0));
                    assertArrayEquals(vector.bytes, spool.read(1));
                }
                assertEquals(0, directory.list().length);
            } finally { directory.delete(); }
        }
    }

    @Test public void writesLargeAndSmallFactsWithoutChangingIdentityOrReadingSourceTwice() throws Exception {
        FactRecord large = FramedSyncFactFragmentsTest.largeFact(2, 1100 * 1024);
        FactRecord small = FramedSyncFactFragmentsTest.largeFact(1, 12).toBuilder()
            .setIdentity(large.getIdentity().toBuilder().setFactId("state-0")).build();
        var source = new FramedSyncSourceWriterFixture(Arrays.asList(large, small));
        var staging = run(source);
        int count = source.messages.stream().mapToInt(java.util.List::size).sum();
        assertEquals(count, source.reads);
        assertTrue(staging.finalized);
        assertEquals(count + 2, staging.frames.size());
        for (int index = 0, sequence = 1; index < source.messages.size(); index++) {
            for (byte[] original : source.messages.get(index)) {
                assertArrayEquals(original, staging.frames.get(sequence++).plaintext());
            }
        }
        assertEquals(source.header().getTransferId(),
            ProtocolMessage.parseFrom(staging.frames.get(0).plaintext()).getTransferHeader().getTransferId());
        assertEquals(2, ProtocolMessage.parseFrom(staging.frames.get(count + 1).plaintext())
            .getTransferTrailer().getFactCount());
    }

    @Test public void oldArrayPathRejectsTheSameLegalLargeFactThatSourceCanSend() throws Exception {
        FactRecord fact = FramedSyncFactFragmentsTest.largeFact(2, 1100 * 1024);
        try {
            FramedSyncTransferWriter.prepare(new byte[32], FramedSyncSourceWriterFixture.CONTEXT,
                Collections.singletonList(fact), Collections.emptyList(), new FramedSyncSourceWriterFixture.Staging());
            fail("old unfragmented path must reject an oversized wire frame");
        } catch (IllegalArgumentException expected) {
            assertEquals("wire_frame_limit_exceeded", expected.getMessage());
        }
        assertTrue(run(new FramedSyncSourceWriterFixture(Collections.singletonList(fact))).finalized);
    }

    @Test public void refusesDescriptorOrCompleteContentMismatchBeforePreparingCiphertext() throws Exception {
        FactRecord fact = FramedSyncFactFragmentsTest.largeFact(1, 12);
        var wrongIdentity = new FramedSyncSourceWriterFixture(Collections.singletonList(fact));
        FactRecord changed = fact.toBuilder().setIdentity(fact.getIdentity().toBuilder().setFactId("other")).build();
        wrongIdentity.messages.get(0).set(0, ProtocolMessage.newBuilder().setFact(changed).build().toByteArray());
        reject(wrongIdentity, "framed_sync_fact_descriptor_mismatch");
        var wrongContent = new FramedSyncSourceWriterFixture(Collections.singletonList(fact));
        changed = fact.toBuilder().setBody(FramedSyncFactFragmentsTest.largeFact(1, 13).getBody()).build();
        wrongContent.messages.get(0).set(0, ProtocolMessage.newBuilder().setFact(changed).build().toByteArray());
        reject(wrongContent, "framed_sync_manifest_identity_mismatch");
    }

    @Test public void rejectsFragmentTruncationOffsetAndDigestCorruption() throws Exception {
        FactRecord fact = FramedSyncFactFragmentsTest.largeFact(2, 1100 * 1024);
        var truncated = new FramedSyncSourceWriterFixture(Collections.singletonList(fact));
        truncated.messages.get(0).remove(truncated.messages.get(0).size() - 1);
        reject(truncated, "fact_fragment_incomplete");
        var offset = new FramedSyncSourceWriterFixture(Collections.singletonList(fact));
        var fragment = FramedSyncFactFragments.fragment(offset.messages.get(0).get(1));
        offset.messages.get(0).set(1, ProtocolMessage.newBuilder().setFactFragment(fragment.toBuilder()
            .setOffset(1)).build().toByteArray());
        reject(offset, "fact_fragment_sequence_invalid");
        var altered = new FramedSyncSourceWriterFixture(Collections.singletonList(fact));
        fragment = FramedSyncFactFragments.fragment(altered.messages.get(0).get(1));
        byte[] bytes = fragment.getData().toByteArray(); bytes[0] ^= 1;
        altered.messages.get(0).set(1, ProtocolMessage.newBuilder().setFactFragment(fragment.toBuilder()
            .setData(ByteString.copyFrom(bytes))).build().toByteArray());
        reject(altered, "fact_fragment_hash_mismatch");
    }

    @Test public void rejectsWrongContextAndUsesCanonicalOrderForUnsortedMetadata() throws Exception {
        FactRecord fact = FramedSyncFactFragmentsTest.largeFact(1, 12);
        var context = new FramedSyncSourceWriterFixture(Collections.singletonList(fact));
        context.template = context.template.toBuilder().setManifest(context.template.getManifest().toBuilder()
            .setGroupId("another-group")).build();
        reject(context, "inbound_transfer_identity_mismatch");
        FactRecord second = fact.toBuilder().setIdentity(fact.getIdentity().toBuilder().setFactId("state-2")).build();
        var order = new FramedSyncSourceWriterFixture(Arrays.asList(fact, second));
        var manifest = order.template.getManifest();
        order.template = order.template.toBuilder().setManifest(manifest.toBuilder().clearFacts()
            .addFacts(manifest.getFacts(1)).addFacts(manifest.getFacts(0))).build();
        Collections.reverse(order.messages);
        var staged = run(order);
        assertEquals(fact, ProtocolMessage.parseFrom(staged.frames.get(1).plaintext()).getFact());
        assertEquals(second, ProtocolMessage.parseFrom(staged.frames.get(2).plaintext()).getFact());
    }

    private static FramedSyncSourceWriterFixture.Staging run(FramedSyncSourceWriterFixture source) throws Exception {
        File directory = Files.createTempDirectory("framed-source-test-").toFile();
        var staging = new FramedSyncSourceWriterFixture.Staging();
        try {
            FramedSyncTransferWriter.prepare(new byte[32], FramedSyncSourceWriterFixture.CONTEXT,
                source, Collections.emptyList(), staging, directory);
            assertEquals(0, directory.list().length);
            return staging;
        } finally {
            assertEquals(0, directory.list().length);
            directory.delete();
        }
    }

    private static void reject(FramedSyncSourceWriterFixture source, String code) throws Exception {
        try { run(source); fail("expected " + code); }
        catch (FramedSyncValidationException error) { assertEquals(code, error.code()); }
    }
}
