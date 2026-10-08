package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.FactFragment;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class FramedSyncFactFragmentsTest {
    @Test public void decodesOneOriginalFactAfterVerifiedDurableFragments() throws Exception {
        FactRecord original = largeFact(2, 1100 * 1024);
        byte[] encoded = ProtocolMessage.newBuilder().setFact(original).build().toByteArray();
        List<byte[]> frames = fragments(original, encoded);
        reject(() -> FramedSyncCodec.decode(encoded, 3), "frame_payload_limit_exceeded");
        for (byte[] frame : frames) {
            assertEquals(FramedSyncPayload.Case.FACT_FRAGMENT, FramedSyncCodec.decode(frame, 3).payload().payloadCase());
        }
        assertEquals(original, FramedSyncFactFragments.assemble(1, frames.size(),
            sequence -> frames.get((int) sequence - 1)));
        // A new owner can read exactly the same persisted frame inputs, without a retained assembler.
        assertEquals(original, FramedSyncFactFragments.assemble(1, frames.size(),
            sequence -> frames.get((int) sequence - 1)));
    }

    @Test public void rejectsMissingAlteredOrMismatchedPiecesAndPrematureTail() throws Exception {
        FactRecord original = largeFact(2, 1100 * 1024);
        List<byte[]> frames = fragments(original, ProtocolMessage.newBuilder().setFact(original).build().toByteArray());
        reject(() -> FramedSyncFactFragments.assemble(1, frames.size(),
            sequence -> sequence == 2 ? null : frames.get((int) sequence - 1)), "fact_fragment_incomplete");
        reject(() -> FramedSyncFactFragments.assemble(1, frames.size() - 1,
            sequence -> frames.get((int) sequence - 1)), "fact_fragment_incomplete");
        FactFragment first = FramedSyncFactFragments.fragment(frames.get(0));
        FactFragment second = FramedSyncFactFragments.fragment(frames.get(1));
        ProtocolMessage initial = ProtocolMessage.newBuilder().setFactFragment(first).build();
        reject(() -> FramedSyncFactFragments.continuation(initial,
            ProtocolMessage.newBuilder().setFact(original).build()), "fact_fragment_incomplete");
        reject(() -> FramedSyncFactFragments.continuation(initial,
            ProtocolMessage.newBuilder().setFactFragment(second.toBuilder().setOffset(1)).build()),
            "fact_fragment_sequence_invalid");
        reject(() -> FramedSyncFactFragments.continuation(initial,
            ProtocolMessage.newBuilder().setFactFragment(second.toBuilder()
                .setSharedStateHash(ByteString.copyFrom(new byte[] {1}))).build()),
            "fact_fragment_sequence_invalid");
        byte[] changed = second.getData().toByteArray(); changed[0] ^= 1;
        byte[] altered = ProtocolMessage.newBuilder().setFactFragment(second.toBuilder()
            .setData(ByteString.copyFrom(changed))).build().toByteArray();
        reject(() -> FramedSyncFactFragments.assemble(1, frames.size(),
            sequence -> sequence == 2 ? altered : frames.get((int) sequence - 1)), "fact_fragment_hash_mismatch");
    }

    @Test public void preservesCanonicalStringAndCompleteFactLimitsAfterAssembly() throws Exception {
        FactRecord badString = largeFact(2, FramedSyncContract.MAX_CANONICAL_STRING_BYTES + 1);
        assertInvalidOriginal(badString, "canonical_string_limit_exceeded");
        FactRecord badTotal = largeFact(6, 1500 * 1024);
        assertInvalidOriginal(badTotal, "canonical_manifest_limit_exceeded");
    }

    @Test public void rejectsOuterIdentityThatDoesNotMatchTheVerifiedOriginalFact() throws Exception {
        FactRecord original = largeFact(2, 1100 * 1024);
        List<byte[]> frames = fragments(original, ProtocolMessage.newBuilder().setFact(original).build().toByteArray());
        List<byte[]> changed = new ArrayList<>();
        for (byte[] encoded : frames) {
            FactFragment fragment = FramedSyncFactFragments.fragment(encoded);
            changed.add(ProtocolMessage.newBuilder().setFactFragment(fragment.toBuilder()
                .setIdentity(fragment.getIdentity().toBuilder().setFactId("other-state"))).build().toByteArray());
        }
        reject(() -> FramedSyncFactFragments.assemble(1, changed.size(),
            sequence -> changed.get((int) sequence - 1)), "fact_fragment_identity_mismatch");
    }

    @Test public void rejectsFragmentBoundsBeforeOwnerReads() throws Exception {
        FactRecord original = largeFact(2, 1100 * 1024);
        FactFragment first = FramedSyncFactFragments.fragment(fragments(original,
            ProtocolMessage.newBuilder().setFact(original).build().toByteArray()).get(0));
        reject(() -> FramedSyncFactFragments.validate(first.toBuilder().setOffset(-1).build()),
            "fact_fragment_range_invalid");
        reject(() -> FramedSyncFactFragments.validate(first.toBuilder()
            .setTotalByteLength(FramedSyncFactFragments.MAX_ENCODED_BYTES + 1L).build()), "fact_fragment_range_invalid");
        reject(() -> FramedSyncFactFragments.validate(first.toBuilder()
            .setData(ByteString.copyFrom(new byte[FramedSyncContract.BLOB_CHUNK_BYTES + 1])).build()),
            "fact_fragment_range_invalid");
    }

    private static void assertInvalidOriginal(FactRecord fact, String error) throws Exception {
        List<byte[]> frames = fragments(fact, ProtocolMessage.newBuilder().setFact(fact).build().toByteArray());
        reject(() -> FramedSyncFactFragments.assemble(1, frames.size(),
            sequence -> frames.get((int) sequence - 1)), error);
    }

    static FactRecord largeFact(int fields, int size) {
        CanonicalObject.Builder body = CanonicalObject.newBuilder();
        for (int index = 0; index < fields; index++) body.addFields(CanonicalField.newBuilder()
            .setName("field_" + index).setValue(CanonicalValue.newBuilder().setStringValue("x".repeat(size))));
        return FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder()
            .setKind(FactKind.FACT_KIND_OBJECT_STATE).setObjectType("settings")
            .setGlobalId("settings-1").setFactId("state-1"))
            .setSharedStateHash(ByteString.copyFrom(new byte[32])).setBody(body).build();
    }

    static List<byte[]> fragments(FactRecord fact, byte[] encoded) throws Exception {
        ByteString hash = ByteString.copyFrom(MessageDigest.getInstance("SHA-256").digest(encoded));
        List<byte[]> frames = new ArrayList<>();
        for (int offset = 0; offset < encoded.length; offset += FramedSyncContract.BLOB_CHUNK_BYTES) {
            frames.add(ProtocolMessage.newBuilder().setFactFragment(FactFragment.newBuilder()
                .setIdentity(fact.getIdentity()).setSharedStateHash(fact.getSharedStateHash())
                .setEncodedSha256(hash).setTotalByteLength(encoded.length).setOffset(offset)
                .setData(ByteString.copyFrom(encoded, offset,
                    Math.min(FramedSyncContract.BLOB_CHUNK_BYTES, encoded.length - offset)))).build().toByteArray());
        }
        return frames;
    }

    private interface Action { void run() throws Exception; }

    private static void reject(Action action, String expected) throws Exception {
        try { action.run(); fail("expected rejection: " + expected); }
        catch (FramedSyncValidationException error) { assertEquals(expected, error.code()); }
    }
}
