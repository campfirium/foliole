package com.foliole.android.framed;

import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.Capability;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.TransferManifest;
import com.google.protobuf.ByteString;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class FramedSyncValueValidator {
    private FramedSyncValueValidator() {}

    static void digest(ByteString value, String name) throws FramedSyncValidationException {
        if (value.size() != FramedSyncContract.DIGEST_BYTES) {
            throw invalid(name + "_must_be_32_bytes");
        }
    }

    static void fixed(ByteString value, int size, String name) throws FramedSyncValidationException {
        if (value.size() != size) throw invalid(name + "_length_invalid");
    }

    static void text(String value, String name) throws FramedSyncValidationException {
        if (value.isEmpty()) throw invalid("protocol_string_required");
        protocolString(value);
    }

    static void protocolString(String value) throws FramedSyncValidationException {
        boundedString(value, FramedSyncContract.MAX_PROTOCOL_STRING_BYTES,
            "protocol_string_limit_exceeded");
    }

    private static void boundedString(String value, int limit, String error)
        throws FramedSyncValidationException {
        for (int index = 0; index < value.length(); index++) {
            char unit = value.charAt(index);
            if (Character.isHighSurrogate(unit)) {
                if (++index >= value.length() || !Character.isLowSurrogate(value.charAt(index))) {
                    throw invalid("protocol_unicode_invalid");
                }
            } else if (Character.isLowSurrogate(unit)) {
                throw invalid("protocol_unicode_invalid");
            }
        }
        if (value.getBytes(StandardCharsets.UTF_8).length > limit) {
            throw invalid(error);
        }
    }

    static void list(List<?> values, int limit) throws FramedSyncValidationException {
        if (values.size() > limit) throw invalid("protocol_repeated_limit_exceeded");
    }

    static <T> void unique(List<T> values, String name) throws FramedSyncValidationException {
        if (new HashSet<>(values).size() != values.size()) throw invalid(name + "_duplicate");
    }

    static String identity(FactIdentity value) throws FramedSyncValidationException {
        if (value.getKindValue() < 1 || value.getKindValue() > 8) throw invalid("fact_kind_invalid");
        text(value.getObjectType(), "objectType");
        text(value.getGlobalId(), "globalId");
        text(value.getFactId(), "factId");
        return value.getKindValue() + "\0" + value.getObjectType() + "\0" +
            value.getGlobalId() + "\0" + value.getFactId();
    }

    static void identities(List<FactIdentity> values) throws FramedSyncValidationException {
        list(values, FramedSyncContract.MAX_FACTS_PER_TRANSFER);
        List<String> keys = new ArrayList<>();
        for (FactIdentity value : values) keys.add(identity(value));
        unique(keys, "fact_identity");
    }

    static ByteString blob(BlobReference value) throws FramedSyncValidationException {
        digest(value.getSha256(), "blob_hash");
        if (value.getRoleValue() < 1 || value.getRoleValue() > 5) throw invalid("blob_role_invalid");
        long limit = FramedSyncBodyRoles.isBody(value.getRoleValue())
            ? FramedSyncContract.MAX_BODY_BYTES : FramedSyncContract.MAX_BLOB_BYTES;
        if (Long.compareUnsigned(value.getByteLength(), limit) > 0) {
            throw invalid("blob_byte_length_limit_exceeded");
        }
        return value.getSha256();
    }

    static List<ByteString> blobs(List<BlobReference> values, String name)
        throws FramedSyncValidationException {
        list(values, FramedSyncContract.MAX_BLOBS_PER_TRANSFER);
        List<ByteString> hashes = new ArrayList<>();
        for (BlobReference value : values) hashes.add(blob(value));
        unique(hashes, name);
        return hashes;
    }

    static void fact(FactRecord value) throws FramedSyncValidationException {
        if (!value.hasIdentity() || !value.hasBody()) throw invalid("protocol_object_required");
        identity(value.getIdentity());
        digest(value.getSharedStateHash(), "shared_state_hash");
        canonicalObject(value.getBody(), 0);
        blobs(value.getBlobsList(), "fact_blob");
    }

    static void manifest(TransferManifest value) throws FramedSyncValidationException {
        if (value.getProtocolVersion() != FramedSyncContract.PROTOCOL_VERSION) {
            throw invalid("protocol_version_invalid");
        }
        text(value.getGroupId(), "group_id");
        digest(value.getContentId(), "content_id");
        list(value.getFactsList(), FramedSyncContract.MAX_FACTS_PER_TRANSFER);
        List<String> identities = new ArrayList<>();
        for (var fact : value.getFactsList()) {
            if (!fact.hasIdentity()) throw invalid("protocol_object_required");
            identities.add(identity(fact.getIdentity()));
        }
        unique(identities, "manifest_fact");
        Set<ByteString> declared = new HashSet<>(blobs(value.getBlobsList(), "manifest_blob"));
        for (var fact : value.getFactsList()) {
            digest(fact.getSharedStateHash(), "shared_state_hash");
            list(fact.getRequiredBlobHashesList(), FramedSyncContract.MAX_FACT_BLOB_EDGES);
            for (ByteString hash : fact.getRequiredBlobHashesList()) digest(hash, "blob_hash");
            unique(fact.getRequiredBlobHashesList(), "required_blob_hash");
            if (!declared.containsAll(fact.getRequiredBlobHashesList())) {
                throw invalid("required_blob_undeclared");
            }
        }
    }

    static void capabilities(List<Capability> values) throws FramedSyncValidationException {
        list(values, FramedSyncContract.MAX_PROTOCOL_CAPABILITIES);
        List<String> names = new ArrayList<>();
        for (Capability value : values) {
            text(value.getName(), "capability_name");
            if (value.getVersion() == 0) throw invalid("capability_version_invalid");
            names.add(value.getName());
        }
        unique(names, "capability");
    }

    private static void canonicalObject(CanonicalObject value, int depth)
        throws FramedSyncValidationException {
        requireDepth(depth);
        list(value.getFieldsList(), FramedSyncContract.MAX_DECODED_REPEATED_ITEMS);
        List<String> names = new ArrayList<>();
        for (CanonicalField field : value.getFieldsList()) {
            text(field.getName(), "canonical_field_name");
            names.add(field.getName());
            if (!field.hasValue()) throw invalid("canonical_value_case_invalid");
            canonicalValue(field.getValue(), depth + 1);
        }
        unique(names, "canonical_field");
    }

    private static void canonicalValue(CanonicalValue value, int depth)
        throws FramedSyncValidationException {
        requireDepth(depth);
        switch (value.getValueCase()) {
            case STRING_VALUE:
                boundedString(value.getStringValue(), FramedSyncContract.MAX_CANONICAL_STRING_BYTES,
                    "canonical_string_limit_exceeded");
                break;
            case BYTES_VALUE:
                if (value.getBytesValue().size() > FramedSyncContract.MAX_FRAME_MESSAGE_BYTES) {
                    throw invalid("protocol_bytes_limit_exceeded");
                }
                break;
            case LIST_VALUE:
                list(value.getListValue().getValuesList(), FramedSyncContract.MAX_DECODED_REPEATED_ITEMS);
                for (CanonicalValue child : value.getListValue().getValuesList()) {
                    canonicalValue(child, depth + 1);
                }
                break;
            case OBJECT_VALUE:
                canonicalObject(value.getObjectValue(), depth + 1);
                break;
            case NULL_VALUE:
                if (!value.getNullValue()) throw invalid("canonical_null_invalid");
                break;
            case BOOL_VALUE:
            case SIGNED_VALUE:
            case UNSIGNED_VALUE:
                break;
            case VALUE_NOT_SET:
                throw invalid("canonical_value_case_invalid");
        }
    }

    private static void requireDepth(int depth) throws FramedSyncValidationException {
        if (depth > FramedSyncContract.MAX_CANONICAL_DEPTH) {
            throw invalid("canonical_depth_limit_exceeded");
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
