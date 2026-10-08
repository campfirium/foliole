package com.foliole.android.framed;

import com.foliole.sync.v22.InventoryEntry;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import com.google.protobuf.MessageLite;
import java.util.ArrayList;
import java.util.List;

final class FramedSyncPayloadValidator {
    private FramedSyncPayloadValidator() {}

    static FramedSyncPayload validate(ProtocolMessage message) throws FramedSyncValidationException {
        switch (message.getPayloadCase()) {
            case HANDSHAKE:
                handshake(message.getHandshake());
                return payload(FramedSyncPayload.Case.HANDSHAKE, message.getHandshake());
            case HANDSHAKE_ACCEPTANCE:
                acceptance(message.getHandshakeAcceptance());
                return payload(FramedSyncPayload.Case.HANDSHAKE_ACCEPTANCE, message.getHandshakeAcceptance());
            case INVENTORY_BEGIN:
                inventoryBegin(message.getInventoryBegin());
                return payload(FramedSyncPayload.Case.INVENTORY_BEGIN, message.getInventoryBegin());
            case INVENTORY_CHUNK:
                inventoryChunk(message.getInventoryChunk());
                return payload(FramedSyncPayload.Case.INVENTORY_CHUNK, message.getInventoryChunk());
            case INVENTORY_END:
                fixedRound(message.getInventoryEnd().getRoundId());
                FramedSyncValueValidator.digest(message.getInventoryEnd().getInventoryHash(), "inventory_hash");
                return payload(FramedSyncPayload.Case.INVENTORY_END, message.getInventoryEnd());
            case DIFFERENCE_REQUEST:
                difference(message.getDifferenceRequest());
                return payload(FramedSyncPayload.Case.DIFFERENCE_REQUEST, message.getDifferenceRequest());
            case TRANSFER_PROPOSAL:
                proposal(message.getTransferProposal());
                return payload(FramedSyncPayload.Case.TRANSFER_PROPOSAL, message.getTransferProposal());
            case BLOB_OFFER:
                FramedSyncValueValidator.digest(message.getBlobOffer().getTransferId(), "transfer_id");
                FramedSyncValueValidator.blobs(message.getBlobOffer().getBlobsList(), "blob_offer");
                return payload(FramedSyncPayload.Case.BLOB_OFFER, message.getBlobOffer());
            case MISSING_BLOB_SET:
                FramedSyncValueValidator.digest(message.getMissingBlobSet().getTransferId(), "transfer_id");
                digestList(message.getMissingBlobSet().getMissingHashesList(), "missing_blob_hash",
                    FramedSyncContract.MAX_BLOBS_PER_TRANSFER);
                return payload(FramedSyncPayload.Case.MISSING_BLOB_SET, message.getMissingBlobSet());
            case TRANSFER_HEADER:
                header(message.getTransferHeader());
                return payload(FramedSyncPayload.Case.TRANSFER_HEADER, message.getTransferHeader());
            case FACT:
                FramedSyncValueValidator.fact(message.getFact());
                return payload(FramedSyncPayload.Case.FACT, message.getFact());
            case FACT_FRAGMENT:
                FramedSyncFactFragments.validate(message.getFactFragment());
                return payload(FramedSyncPayload.Case.FACT_FRAGMENT, message.getFactFragment());
            case BLOB_CHUNK:
                blobChunk(message.getBlobChunk());
                return payload(FramedSyncPayload.Case.BLOB_CHUNK, message.getBlobChunk());
            case TRANSFER_TRAILER:
                trailer(message.getTransferTrailer());
                return payload(FramedSyncPayload.Case.TRANSFER_TRAILER, message.getTransferTrailer());
            case TRANSFER_RECEIPT:
                receipt(message.getTransferReceipt());
                return payload(FramedSyncPayload.Case.TRANSFER_RECEIPT, message.getTransferReceipt());
            case ROUND_RECEIPT:
                roundReceipt(message.getRoundReceipt());
                return payload(FramedSyncPayload.Case.ROUND_RECEIPT, message.getRoundReceipt());
            case TRANSFER_TERMINATION:
                FramedSyncValueValidator.digest(message.getTransferTermination().getTransferId(), "transfer_id");
                FramedSyncValueValidator.text(message.getTransferTermination().getMemberId(), "member_id");
                return payload(FramedSyncPayload.Case.TRANSFER_TERMINATION, message.getTransferTermination());
            case ERROR:
                protocolError(message.getError());
                return payload(FramedSyncPayload.Case.ERROR, message.getError());
            case PAYLOAD_NOT_SET:
            default:
                throw invalid("protocol_payload_case_invalid");
        }
    }

    static FramedSyncFrameType frameType(FramedSyncPayload.Case payloadCase) {
        return FramedSyncPayloadFrameType.of(payloadCase);
    }

    private static void handshake(com.foliole.sync.v22.Handshake value)
        throws FramedSyncValidationException {
        version(value.getProtocolVersion());
        FramedSyncValueValidator.text(value.getGroupId(), "group_id");
        FramedSyncValueValidator.text(value.getDeviceId(), "device_id");
        FramedSyncValueValidator.text(value.getLibraryEpoch(), "library_epoch");
        FramedSyncValueValidator.fixed(value.getSessionId(), FramedSyncContract.IDENTIFIER_BYTES, "session_id");
        FramedSyncValueValidator.capabilities(value.getCapabilitiesList());
    }

    private static void acceptance(com.foliole.sync.v22.HandshakeAcceptance value)
        throws FramedSyncValidationException {
        version(value.getProtocolVersion());
        FramedSyncValueValidator.fixed(value.getSessionId(), FramedSyncContract.IDENTIFIER_BYTES, "session_id");
        FramedSyncValueValidator.capabilities(value.getCapabilitiesList());
    }

    private static void inventoryBegin(com.foliole.sync.v22.InventoryBegin value)
        throws FramedSyncValidationException {
        fixedRound(value.getRoundId());
        if (Long.compareUnsigned(value.getEntryCount(), FramedSyncContract.MAX_INVENTORY_ENTRIES) > 0) {
            throw invalid("inventory_entry_limit_exceeded");
        }
    }

    private static void inventoryChunk(com.foliole.sync.v22.InventoryChunk value)
        throws FramedSyncValidationException {
        fixedRound(value.getRoundId());
        FramedSyncValueValidator.list(value.getEntriesList(), FramedSyncContract.MAX_INVENTORY_ENTRIES_PER_FRAME);
        List<String> keys = new ArrayList<>();
        for (InventoryEntry entry : value.getEntriesList()) {
            FramedSyncValueValidator.text(entry.getObjectType(), "object_type");
            FramedSyncValueValidator.text(entry.getGlobalId(), "global_id");
            FramedSyncValueValidator.digest(entry.getSharedStateHash(), "shared_state_hash");
            stringList(entry.getFrontierFactIdsList(), "frontierFactIds");
            stringList(entry.getRequiredRelationIdsList(), "requiredRelationIds");
            stringList(entry.getReviewFactIdsList(), "reviewFactIds");
            stringList(entry.getStateFactIdsList(), "stateFactIds");
            digestList(entry.getResourceHashesList(), "resource_hash", FramedSyncContract.MAX_BLOBS_PER_TRANSFER);
            keys.add(entry.getObjectType() + "\0" + entry.getGlobalId());
        }
        FramedSyncValueValidator.unique(keys, "inventory_entry");
    }

    private static void difference(com.foliole.sync.v22.DifferenceRequest value)
        throws FramedSyncValidationException {
        fixedRound(value.getRoundId());
        FramedSyncValueValidator.identities(value.getFactsList());
        digestList(value.getBlobHashesList(), "blob_hash", FramedSyncContract.MAX_BLOBS_PER_TRANSFER);
    }

    private static void proposal(com.foliole.sync.v22.TransferProposal value)
        throws FramedSyncValidationException {
        FramedSyncValueValidator.digest(value.getTransferId(), "transfer_id");
        FramedSyncValueValidator.digest(value.getContentId(), "content_id");
        FramedSyncValueValidator.text(value.getSenderDeviceId(), "senderDeviceId");
        FramedSyncValueValidator.text(value.getSenderLibraryEpoch(), "senderLibraryEpoch");
        FramedSyncValueValidator.text(value.getReceiverDeviceId(), "receiverDeviceId");
        FramedSyncValueValidator.text(value.getReceiverLibraryEpoch(), "receiverLibraryEpoch");
        if (Long.compareUnsigned(value.getFactCount(), FramedSyncContract.MAX_FACTS_PER_TRANSFER) > 0 ||
            Long.compareUnsigned(value.getBlobCount(), FramedSyncContract.MAX_BLOBS_PER_TRANSFER) > 0 ||
            Long.compareUnsigned(value.getTotalBlobBytes(), FramedSyncContract.MAX_TRANSFER_BYTES) > 0) {
            throw invalid("transfer_proposal_limit_exceeded");
        }
    }

    private static void header(com.foliole.sync.v22.TransferHeader value)
        throws FramedSyncValidationException {
        FramedSyncValueValidator.digest(value.getTransferId(), "transfer_id");
        FramedSyncValueValidator.fixed(value.getAttemptId(), FramedSyncContract.IDENTIFIER_BYTES, "attempt_id");
        if (!value.hasManifest()) throw invalid("protocol_object_required");
        FramedSyncValueValidator.manifest(value.getManifest());
    }

    private static void blobChunk(com.foliole.sync.v22.BlobChunk value)
        throws FramedSyncValidationException {
        FramedSyncValueValidator.digest(value.getTransferId(), "transfer_id");
        FramedSyncValueValidator.digest(value.getBlobHash(), "blob_hash");
        long size = value.getData().size();
        if (size > 1_048_576 ||
            Long.compareUnsigned(value.getOffset(), FramedSyncContract.MAX_BLOB_BYTES) > 0 ||
            Long.compareUnsigned(value.getOffset(), FramedSyncContract.MAX_BLOB_BYTES - size) > 0) {
            throw invalid("blob_chunk_range_invalid");
        }
    }

    private static void trailer(com.foliole.sync.v22.TransferTrailer value)
        throws FramedSyncValidationException {
        FramedSyncValueValidator.digest(value.getTransferId(), "transfer_id");
        FramedSyncValueValidator.digest(value.getManifestHash(), "manifest_hash");
        if (Long.compareUnsigned(value.getFactCount(), FramedSyncContract.MAX_FACTS_PER_TRANSFER) > 0 ||
            Long.compareUnsigned(value.getBlobCount(), FramedSyncContract.MAX_BLOBS_PER_TRANSFER) > 0) {
            throw invalid("transfer_trailer_limit_exceeded");
        }
    }

    private static void receipt(com.foliole.sync.v22.TransferReceipt value)
        throws FramedSyncValidationException {
        FramedSyncValueValidator.digest(value.getTransferId(), "transfer_id");
        FramedSyncValueValidator.digest(value.getContentId(), "content_id");
        FramedSyncValueValidator.digest(value.getAppliedStateHash(), "applied_state_hash");
        FramedSyncValueValidator.text(value.getReceiverDeviceId(), "receiver_device_id");
        FramedSyncValueValidator.text(value.getReceiverLibraryEpoch(), "receiver_library_epoch");
    }

    private static void roundReceipt(com.foliole.sync.v22.RoundReceipt value)
        throws FramedSyncValidationException {
        fixedRound(value.getRoundId());
        if (value.getResultValue() < 1 || value.getResultValue() > 2) throw invalid("round_result_invalid");
        FramedSyncValueValidator.identities(value.getDeferredFactsList());
    }

    private static void protocolError(com.foliole.sync.v22.ProtocolError value)
        throws FramedSyncValidationException {
        if (value.getCodeValue() < 1 || value.getCodeValue() > 8) throw invalid("error_code_invalid");
        FramedSyncValueValidator.text(value.getMessage(), "error_message");
        if (!value.getTransferId().isEmpty()) {
            FramedSyncValueValidator.digest(value.getTransferId(), "transfer_id");
        }
    }

    private static void version(int value) throws FramedSyncValidationException {
        if (value != FramedSyncContract.PROTOCOL_VERSION) throw invalid("protocol_version_invalid");
    }

    private static void fixedRound(ByteString value) throws FramedSyncValidationException {
        FramedSyncValueValidator.fixed(value, FramedSyncContract.IDENTIFIER_BYTES, "round_id");
    }

    private static void stringList(List<String> values, String name)
        throws FramedSyncValidationException {
        FramedSyncValueValidator.list(values, FramedSyncContract.MAX_INVENTORY_FACT_IDS_PER_ENTRY);
        for (String value : values) FramedSyncValueValidator.text(value, name);
        FramedSyncValueValidator.unique(values, name);
    }

    private static void digestList(List<ByteString> values, String name, int limit)
        throws FramedSyncValidationException {
        FramedSyncValueValidator.list(values, limit);
        for (ByteString value : values) FramedSyncValueValidator.digest(value, name);
        FramedSyncValueValidator.unique(values, name);
    }

    private static FramedSyncPayload payload(FramedSyncPayload.Case payloadCase, MessageLite value) {
        return new FramedSyncPayload(payloadCase, value);
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
