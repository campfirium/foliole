package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class FramedSyncCanonicalBudgetTest {
    @Test public void cumulativeFactBodiesHaveAnIndependentBound() throws Exception {
        assertEquals(32, FramedSyncCanonicalManifest.contentId(facts(80), Collections.emptyList()).length);
        try {
            FramedSyncCanonicalManifest.contentId(facts(86), Collections.emptyList());
            fail("accepted excessive cumulative bodies");
        } catch (FramedSyncValidationException error) {
            assertEquals("canonical_manifest_limit_exceeded", error.code());
        }
    }

    @Test public void ciphertextIncludesTheFullDecodedFrameAndTag() {
        int size = 2 * 1024 * 1024 + 16;
        assertEquals(size, FramedSyncWireHeader.decode(FramedSyncWireHeader.encode(size, 0, 3)).ciphertextBytes());
        try {
            FramedSyncWireHeader.encode(size + 1, 0, 3);
            fail("accepted excessive ciphertext");
        } catch (IllegalArgumentException error) {
            assertEquals("wire_frame_limit_exceeded", error.getMessage());
        }
    }

    private List<FactRecord> facts(int count) {
        List<FactRecord> facts = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            facts.add(FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder()
                .setKind(FactKind.FACT_KIND_NODE_VERSION).setObjectType("node")
                .setGlobalId("node-1").setFactId("version-" + index))
                .setSharedStateHash(ByteString.copyFrom(new byte[32]))
                .setBody(CanonicalObject.newBuilder().addFields(CanonicalField.newBuilder()
                    .setName("payload_json").setValue(CanonicalValue.newBuilder()
                        .setStringValue("x".repeat(96 * 1024))))).build());
        }
        return facts;
    }
}
