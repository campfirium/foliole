package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.ProtocolMessage;
import java.util.EnumMap;
import java.util.Map;
import org.junit.Test;

public class FramedSyncCodecTest {
    private static final Map<FramedSyncPayload.Case, String> CORPUS_NAMES = corpusNames();

    @Test
    public void runtimeCodecValidatesAndReencodesAllGoldenMessages() throws Exception {
        assertEquals(17, FramedSyncContractSource.messages().size());
        for (FramedSyncContractSource.MessageVector vector : FramedSyncContractSource.messages()) {
            int frameType = frameType(vector.payloadCase).wireValue();
            FramedSyncValidatedMessage validated = FramedSyncCodec.decode(vector.bytes, frameType);
            assertEquals(vector.name, vector.payloadCase,
                CORPUS_NAMES.get(validated.payload().payloadCase()));
            assertArrayEquals(vector.name, vector.bytes, FramedSyncCodec.encode(validated));
        }
    }

    @Test
    public void runtimeCodecRejectsEveryMaliciousCorpusMessage() throws Exception {
        assertEquals(12, FramedSyncContractSource.maliciousMessages().size());
        for (FramedSyncContractSource.MaliciousVector vector :
            FramedSyncContractSource.maliciousMessages()) {
            try {
                FramedSyncCodec.decode(vector.bytes, vector.frameType);
                fail("accepted malicious vector: " + vector.name);
            } catch (FramedSyncValidationException expected) {
                assertEquals(vector.name, vector.expectedError, expected.code());
            }
        }
    }

    @Test
    public void runtimeCodecAcceptsEveryExactBoundaryMessage() throws Exception {
        assertEquals(3, FramedSyncContractSource.acceptedMessages().size());
        for (FramedSyncContractSource.AcceptedVector vector :
            FramedSyncContractSource.acceptedMessages()) {
            FramedSyncValidatedMessage validated = FramedSyncCodec.decode(vector.bytes, vector.frameType);
            assertEquals(vector.name, vector.payloadCase,
                CORPUS_NAMES.get(validated.payload().payloadCase()));
            assertArrayEquals(vector.name, vector.bytes, FramedSyncCodec.encode(validated));
        }
    }

    @Test
    public void authenticatedFrameTypeMustMatchDecodedPayload() throws Exception {
        FramedSyncContractSource.MessageVector fact = golden("fact");
        try {
            FramedSyncCodec.decode(fact.bytes, FramedSyncFrameType.TRANSFER_HEADER.wireValue());
            fail("accepted a fact in a transfer header frame");
        } catch (FramedSyncValidationException expected) {
            assertEquals("frame_payload_type_mismatch", expected.code());
        }
    }

    @Test
    public void outboundMessagesMustValidateBeforeEncoding() throws Exception {
        FramedSyncContractSource.MessageVector fact = golden("fact");
        ProtocolMessage decoded = ProtocolMessage.parseFrom(fact.bytes);
        FramedSyncValidatedMessage validated = FramedSyncCodec.validateOutbound(
            decoded, FramedSyncFrameType.FACT.wireValue());
        assertArrayEquals(fact.bytes, FramedSyncCodec.encode(validated));

        ProtocolMessage invalid = decoded.toBuilder().setFact(
            decoded.getFact().toBuilder().setIdentity(
                decoded.getFact().getIdentity().toBuilder().setKindValue(0))).build();
        try {
            FramedSyncCodec.validateOutbound(invalid, FramedSyncFrameType.FACT.wireValue());
            fail("accepted invalid outbound message");
        } catch (FramedSyncValidationException expected) {
            assertEquals("fact_kind_invalid", expected.code());
        }
    }

    @Test
    public void canonicalTextMayBeEmptyWhileProtocolIdentitiesMayNot() throws Exception {
        ProtocolMessage decoded = ProtocolMessage.parseFrom(golden("fact").bytes);
        CanonicalField emptyBody = CanonicalField.newBuilder().setName("body")
            .setValue(CanonicalValue.newBuilder().setStringValue("")).build();
        ProtocolMessage emptyCanonicalText = decoded.toBuilder().setFact(decoded.getFact().toBuilder()
            .setBody(CanonicalObject.newBuilder().addFields(emptyBody))).build();
        FramedSyncCodec.validateOutbound(
            emptyCanonicalText, FramedSyncFrameType.FACT.wireValue());

        ProtocolMessage emptyIdentity = decoded.toBuilder().setFact(decoded.getFact().toBuilder()
            .setIdentity(decoded.getFact().getIdentity().toBuilder().setFactId(""))).build();
        try {
            FramedSyncCodec.validateOutbound(emptyIdentity, FramedSyncFrameType.FACT.wireValue());
            fail("accepted an empty protocol identity");
        } catch (FramedSyncValidationException expected) {
            assertEquals("protocol_string_required", expected.code());
        }
    }

    private static FramedSyncContractSource.MessageVector golden(String payloadCase) throws Exception {
        for (FramedSyncContractSource.MessageVector vector : FramedSyncContractSource.messages()) {
            if (vector.payloadCase.equals(payloadCase)) return vector;
        }
        throw new AssertionError("missing golden payload: " + payloadCase);
    }

    private static FramedSyncFrameType frameType(String payloadCase) {
        if (payloadCase.equals("transfer_header")) return FramedSyncFrameType.TRANSFER_HEADER;
        if (payloadCase.equals("fact")) return FramedSyncFrameType.FACT;
        if (payloadCase.equals("blob_chunk")) return FramedSyncFrameType.BLOB_CHUNK;
        if (payloadCase.equals("transfer_trailer")) return FramedSyncFrameType.TRANSFER_TRAILER;
        if (payloadCase.equals("transfer_receipt")) return FramedSyncFrameType.TRANSFER_RECEIPT;
        return FramedSyncFrameType.SESSION_CONTROL;
    }

    private static Map<FramedSyncPayload.Case, String> corpusNames() {
        Map<FramedSyncPayload.Case, String> names = new EnumMap<>(FramedSyncPayload.Case.class);
        for (FramedSyncPayload.Case value : FramedSyncPayload.Case.values()) {
            names.put(value, value.name().toLowerCase(java.util.Locale.ROOT));
        }
        return names;
    }
}
