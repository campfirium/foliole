package com.foliole.android.framed;

import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.Capability;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.Handshake;
import com.foliole.sync.v22.HandshakeAcceptance;
import com.foliole.sync.v22.ProtocolError;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.RoundReceipt;
import com.google.protobuf.InvalidProtocolBufferException;
import java.util.HashSet;
import java.util.Set;

final class FramedSyncGeneratedValidator {
    private static final int MAX_CANONICAL_DEPTH = 32;
    private static final int MAX_CAPABILITIES = 64;
    private static final int MAX_DECODED_BYTES = 2 * 1024 * 1024;
    private static final long MAX_BLOB_BYTES = 8L * 1024 * 1024 * 1024;

    private FramedSyncGeneratedValidator() {}

    static ProtocolMessage parse(byte[] encoded) throws InvalidProtocolBufferException {
        if (encoded.length > MAX_DECODED_BYTES) throw invalid("protobuf_message_limit_exceeded");
        ProtocolMessage message = ProtocolMessage.parseFrom(encoded);
        if (message.getPayloadCase() == ProtocolMessage.PayloadCase.PAYLOAD_NOT_SET) {
            throw invalid("protocol_payload_invalid");
        }
        validate(message);
        return message;
    }

    private static void validate(ProtocolMessage message) throws InvalidProtocolBufferException {
        switch (message.getPayloadCase()) {
            case FACT:
                validateFact(message.getFact());
                break;
            case HANDSHAKE:
                validateHandshake(message.getHandshake());
                break;
            case HANDSHAKE_ACCEPTANCE:
                validateCapabilities(message.getHandshakeAcceptance());
                break;
            case BLOB_CHUNK:
                validateBlobChunk(message.getBlobChunk());
                break;
            case ROUND_RECEIPT:
                validateRoundReceipt(message.getRoundReceipt());
                break;
            case ERROR:
                validateError(message.getError());
                break;
            default:
                break;
        }
    }

    private static void validateFact(FactRecord fact) throws InvalidProtocolBufferException {
        validateIdentity(fact.getIdentity());
        if (fact.getSharedStateHash().size() != 32) throw invalid("shared_state_hash_must_be_32_bytes");
        validateObject(fact.getBody(), 0);
        for (BlobReference blob : fact.getBlobsList()) {
            if (blob.getRoleValue() < 1 || blob.getRoleValue() > 5) {
                throw invalid("blob_role_invalid");
            }
        }
    }

    private static void validateIdentity(FactIdentity identity) throws InvalidProtocolBufferException {
        if (identity.getKindValue() < 1 || identity.getKindValue() > 8) {
            throw invalid("fact_kind_invalid");
        }
        if (identity.getObjectType().isEmpty() || identity.getGlobalId().isEmpty() ||
            identity.getFactId().isEmpty()) {
            throw invalid("protocol_string_required");
        }
    }

    private static void validateObject(CanonicalObject object, int depth)
        throws InvalidProtocolBufferException {
        if (depth > MAX_CANONICAL_DEPTH) throw invalid("canonical_depth_limit_exceeded");
        Set<String> names = new HashSet<>();
        for (CanonicalField field : object.getFieldsList()) {
            if (!names.add(field.getName())) throw invalid("canonical_field_duplicate");
            validateValue(field.getValue(), depth + 1);
        }
    }

    private static void validateValue(CanonicalValue value, int depth)
        throws InvalidProtocolBufferException {
        if (depth > MAX_CANONICAL_DEPTH) throw invalid("canonical_depth_limit_exceeded");
        switch (value.getValueCase()) {
            case NULL_VALUE:
                if (!value.getNullValue()) throw invalid("canonical_null_invalid");
                break;
            case LIST_VALUE:
                for (CanonicalValue child : value.getListValue().getValuesList()) {
                    validateValue(child, depth + 1);
                }
                break;
            case OBJECT_VALUE:
                validateObject(value.getObjectValue(), depth + 1);
                break;
            case VALUE_NOT_SET:
                throw invalid("canonical_value_case_invalid");
            default:
                break;
        }
    }

    private static void validateHandshake(Handshake handshake) throws InvalidProtocolBufferException {
        if (handshake.getProtocolVersion() != 22) throw invalid("protocol_version_invalid");
        validateCapabilities(handshake.getCapabilitiesList());
    }

    private static void validateCapabilities(HandshakeAcceptance acceptance)
        throws InvalidProtocolBufferException {
        validateCapabilities(acceptance.getCapabilitiesList());
    }

    private static void validateCapabilities(java.util.List<Capability> capabilities)
        throws InvalidProtocolBufferException {
        if (capabilities.size() > MAX_CAPABILITIES) throw invalid("protocol_repeated_limit_exceeded");
        Set<String> names = new HashSet<>();
        for (Capability capability : capabilities) {
            if (!names.add(capability.getName())) throw invalid("capability_duplicate");
        }
    }

    private static void validateBlobChunk(BlobChunk chunk) throws InvalidProtocolBufferException {
        long offset = chunk.getOffset();
        int dataBytes = chunk.getData().size();
        if (Long.compareUnsigned(offset, MAX_BLOB_BYTES) > 0 ||
            Long.compareUnsigned(offset, MAX_BLOB_BYTES - dataBytes) > 0) {
            throw invalid("blob_chunk_range_invalid");
        }
    }

    private static void validateRoundReceipt(RoundReceipt receipt)
        throws InvalidProtocolBufferException {
        if (receipt.getResultValue() < 1 || receipt.getResultValue() > 2) {
            throw invalid("round_result_invalid");
        }
    }

    private static void validateError(ProtocolError error) throws InvalidProtocolBufferException {
        if (error.getCodeValue() < 1 || error.getCodeValue() > 8) {
            throw invalid("error_code_invalid");
        }
    }

    private static InvalidProtocolBufferException invalid(String message) {
        return new InvalidProtocolBufferException(message);
    }
}
