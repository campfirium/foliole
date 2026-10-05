package com.foliole.android.framed;

import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalList;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.Capability;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.Handshake;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

final class FramedSyncMaliciousMessages {
    static final class Case {
        final String error;
        final ProtocolMessage message;
        final String name;

        Case(String name, String error, ProtocolMessage message) {
            this.error = error;
            this.message = message;
            this.name = name;
        }
    }

    private FramedSyncMaliciousMessages() {}

    static List<Case> all() {
        return Arrays.asList(
            factCase("unspecified-fact-kind", "fact_kind_invalid",
                fact(identity(0, "version-1"), bytes(1, 32), defaultBody(), null)),
            factCase("empty-fact-id", "protocol_string_required",
                fact(identity(2, ""), bytes(1, 32), defaultBody(), null)),
            factCase("short-shared-state-hash", "shared_state_hash_must_be_32_bytes",
                fact(identity(2, "version-1"), bytes(1, 31), defaultBody(), null)),
            factCase("unknown-blob-role", "blob_role_invalid",
                fact(identity(2, "version-1"), bytes(1, 32), defaultBody(),
                    BlobReference.newBuilder().setSha256(bytes(2, 32)).setByteLength(1)
                        .setRoleValue(9).setRequired(true).build())),
            factCase("duplicate-canonical-field", "canonical_field_duplicate",
                fact(identity(2, "version-1"), bytes(1, 32), duplicateBody(), null)),
            factCase("false-null-marker", "canonical_null_invalid",
                fact(identity(2, "version-1"), bytes(1, 32), falseNullBody(), null)),
            new Case("duplicate-capability-name", "capability_duplicate",
                ProtocolMessage.newBuilder().setHandshake(handshake(2)).build()),
            new Case("capability-count-over-limit", "protocol_repeated_limit_exceeded",
                ProtocolMessage.newBuilder().setHandshake(handshake(65)).build()),
            factCase("canonical-depth-over-limit", "canonical_depth_limit_exceeded",
                fact(identity(2, "version-1"), bytes(1, 32), deepBody(), null)),
            new Case("blob-chunk-range-overflow", "blob_chunk_range_invalid",
                ProtocolMessage.newBuilder().setBlobChunk(BlobChunk.newBuilder()
                    .setTransferId(bytes(1, 32)).setBlobHash(bytes(2, 32))
                    .setOffset(-1L).setData(bytes(1, 1))).build())
        );
    }

    private static Case factCase(String name, String error, FactRecord fact) {
        return new Case(name, error, ProtocolMessage.newBuilder().setFact(fact).build());
    }

    private static FactRecord fact(FactIdentity identity, ByteString hash, CanonicalObject body,
                                   BlobReference blob) {
        FactRecord.Builder builder = FactRecord.newBuilder()
            .setIdentity(identity).setSharedStateHash(hash).setBody(body);
        if (blob != null) builder.addBlobs(blob);
        return builder.build();
    }

    private static FactIdentity identity(int kind, String factId) {
        return FactIdentity.newBuilder().setKindValue(kind).setObjectType("node")
            .setGlobalId("node-1").setFactId(factId).build();
    }

    private static CanonicalObject defaultBody() {
        return object(field("title", CanonicalValue.newBuilder().setStringValue("Article").build()));
    }

    private static CanonicalObject duplicateBody() {
        return object(
            field("title", CanonicalValue.newBuilder().setStringValue("A").build()),
            field("title", CanonicalValue.newBuilder().setStringValue("B").build()));
    }

    private static CanonicalObject falseNullBody() {
        return object(field("empty", CanonicalValue.newBuilder().setNullValue(false).build()));
    }

    private static CanonicalObject deepBody() {
        CanonicalValue value = CanonicalValue.newBuilder().setNullValue(true).build();
        for (int index = 0; index < 33; index++) {
            CanonicalList list = CanonicalList.newBuilder().addValues(value).build();
            value = CanonicalValue.newBuilder().setListValue(list).build();
        }
        return object(field("nested", value));
    }

    private static CanonicalField field(String name, CanonicalValue value) {
        return CanonicalField.newBuilder().setName(name).setValue(value).build();
    }

    private static CanonicalObject object(CanonicalField... fields) {
        return CanonicalObject.newBuilder().addAllFields(Arrays.asList(fields)).build();
    }

    private static Handshake handshake(int count) {
        List<Capability> capabilities = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            String name = count == 2 ? "same" : "cap-" + index;
            capabilities.add(Capability.newBuilder().setName(name).setVersion(index + 1).build());
        }
        return Handshake.newBuilder().setProtocolVersion(22).setGroupId("group-a")
            .setDeviceId("device-a").setLibraryEpoch("epoch-a").setSessionId(bytes(3, 16))
            .addAllCapabilities(capabilities).build();
    }

    private static ByteString bytes(int value, int size) {
        byte[] result = new byte[size];
        Arrays.fill(result, (byte) value);
        return ByteString.copyFrom(result);
    }
}
