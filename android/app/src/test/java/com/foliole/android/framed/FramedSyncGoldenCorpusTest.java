package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.foliole.sync.v22.ProtocolMessage;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.Test;

public class FramedSyncGoldenCorpusTest {
    @Test
    public void consumesTheUniqueSchemaAndAllGoldenMessages() throws Exception {
        String proto = FramedSyncContractSource.proto();
        assertTrue(proto.startsWith("syntax = \"proto3\";"));
        assertTrue(proto.contains("option java_package = \"com.foliole.sync.v22\";"));
        assertEquals(FramedSyncContractSource.schemaSha256(), FramedSyncContractSource.sha256(proto));

        Map<Integer, String> schemaPayloads = FramedSyncContractSource.protocolPayloads();
        List<FramedSyncContractSource.MessageVector> messages = FramedSyncContractSource.messages();
        assertEquals(18, schemaPayloads.size());
        assertEquals(18, messages.size());

        Set<Integer> consumedTags = new HashSet<>();
        Set<String> consumedNames = new HashSet<>();
        for (FramedSyncContractSource.MessageVector vector : messages) {
            ProtocolMessage decoded = FramedSyncGeneratedValidator.parse(vector.bytes);
            int payloadTag = decoded.getPayloadCase().getNumber();
            assertEquals(vector.name, schemaPayloads.get(payloadTag), vector.payloadCase);
            assertArrayEquals(vector.name, vector.bytes, decoded.toByteArray());
            assertTrue(vector.name, consumedTags.add(payloadTag));
            assertTrue(vector.name, consumedNames.add(vector.name));
        }
        assertEquals(schemaPayloads.keySet(), consumedTags);
    }

    @Test
    public void rejectsEveryFrozenMalformedFrameHeader() throws Exception {
        List<FramedSyncContractSource.MalformedVector> malformed =
            FramedSyncContractSource.malformedFrames();
        assertEquals(4, malformed.size());
        for (FramedSyncContractSource.MalformedVector vector : malformed) {
            try {
                FramedSyncFrameHeader.validate(vector.bytes);
                throw new AssertionError("accepted malformed vector: " + vector.name);
            } catch (IllegalArgumentException expected) {
                assertTrue(vector.name, expected.getMessage().endsWith("invalid") ||
                    expected.getMessage().endsWith("exceeded"));
            }
        }
    }
}
