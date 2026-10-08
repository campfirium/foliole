package com.foliole.android.framed;

import com.foliole.sync.v22.FactFragment;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import java.security.MessageDigest;

final class FramedSyncFactFragments {
    static final int MAX_ENCODED_BYTES = 2 * FramedSyncContract.MAX_CANONICAL_MANIFEST_BYTES;

    interface Source { byte[] read(long sequence) throws Exception; }

    private FramedSyncFactFragments() {}

    static void validate(FactFragment value) throws FramedSyncValidationException {
        if (!value.hasIdentity()) throw invalid("protocol_object_required");
        FramedSyncValueValidator.identity(value.getIdentity());
        FramedSyncValueValidator.digest(value.getSharedStateHash(), "shared_state_hash");
        FramedSyncValueValidator.digest(value.getEncodedSha256(), "encoded_sha256");
        long total = value.getTotalByteLength();
        long offset = value.getOffset();
        int size = value.getData().size();
        if (total <= FramedSyncContract.MAX_FRAME_MESSAGE_BYTES || total > MAX_ENCODED_BYTES ||
            offset < 0 || offset > total || size <= 0 ||
            size > FramedSyncContract.BLOB_CHUNK_BYTES || size > total - offset) {
            throw invalid("fact_fragment_range_invalid");
        }
    }

    static boolean complete(FactFragment value) {
        return value.getOffset() + value.getData().size() == value.getTotalByteLength();
    }

    static void continuation(ProtocolMessage previous, ProtocolMessage current)
        throws FramedSyncValidationException {
        FactFragment prior = previous != null && previous.hasFactFragment() ? previous.getFactFragment() : null;
        if (prior != null && !complete(prior)) {
            if (!current.hasFactFragment()) throw invalid("fact_fragment_incomplete");
            FactFragment next = current.getFactFragment();
            if (!same(prior, next) || next.getOffset() != prior.getOffset() + prior.getData().size()) {
                throw invalid("fact_fragment_sequence_invalid");
            }
        } else if (current.hasFactFragment() && current.getFactFragment().getOffset() != 0) {
            throw invalid("fact_fragment_sequence_invalid");
        }
    }

    static FactRecord assemble(long first, long last, Source source) throws Exception {
        if (first <= 0 || first > last || last >= FramedSyncTransferReader.MAX_TRANSFER_FRAMES) {
            throw invalid("fact_fragment_sequence_invalid");
        }
        FactFragment initial = fragment(source.read(first));
        if (initial.getOffset() != 0) throw invalid("fact_fragment_sequence_invalid");
        byte[] encoded = new byte[(int) initial.getTotalByteLength()];
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        int offset = 0;
        for (long sequence = first; sequence <= last; sequence++) {
            FactFragment next = fragment(source.read(sequence));
            if (!same(initial, next) || next.getOffset() != offset) throw invalid("fact_fragment_sequence_invalid");
            next.getData().copyTo(encoded, offset);
            hash.update(encoded, offset, next.getData().size());
            offset += next.getData().size();
        }
        if (offset != encoded.length) throw invalid("fact_fragment_incomplete");
        if (!MessageDigest.isEqual(hash.digest(), initial.getEncodedSha256().toByteArray())) {
            throw invalid("fact_fragment_hash_mismatch");
        }
        FactRecord fact = FramedSyncCodec.decodeAssembledFact(encoded);
        if (!fact.getIdentity().equals(initial.getIdentity()) ||
            !fact.getSharedStateHash().equals(initial.getSharedStateHash())) {
            throw invalid("fact_fragment_identity_mismatch");
        }
        return fact;
    }

    static FactFragment fragment(byte[] encoded) throws FramedSyncValidationException {
        if (encoded == null) throw invalid("fact_fragment_incomplete");
        var decoded = FramedSyncCodec.decode(encoded, FramedSyncFrameType.FACT.wireValue());
        if (decoded.payload().payloadCase() != FramedSyncPayload.Case.FACT_FRAGMENT) {
            throw invalid("fact_fragment_sequence_invalid");
        }
        return (FactFragment) decoded.payload().value();
    }

    private static boolean same(FactFragment left, FactFragment right) {
        return left.getIdentity().equals(right.getIdentity()) &&
            left.getSharedStateHash().equals(right.getSharedStateHash()) &&
            left.getEncodedSha256().equals(right.getEncodedSha256()) &&
            left.getTotalByteLength() == right.getTotalByteLength();
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
