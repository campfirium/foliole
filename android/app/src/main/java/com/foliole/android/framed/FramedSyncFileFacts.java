package com.foliole.android.framed;

import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/** Fact payloads remain in the authenticated frame files; only their locators are retained here. */
final class FramedSyncFileFacts {
    private final FramedSyncFileFrames frames;

    FramedSyncFileFacts(FramedSyncFiles files) { frames = new FramedSyncFileFrames(files); }

    byte[] contentId(byte[] transfer, byte[] attempt, long lastSequence, TransferHeader header) throws Exception {
        List<Entry> entries = entries(transfer, attempt, lastSequence, header);
        entries.sort((left, right) -> FramedSyncCanonicalManifest.compareIdentities(left.identity, right.identity));
        return FramedSyncCanonicalManifest.contentId(entries.size(), header.getManifest().getBlobsList(), index -> {
            try { return read(transfer, attempt, entries.get(index)); }
            catch (FramedSyncValidationException error) { throw error; }
            catch (Exception error) { throw new FramedSyncValidationException("canonical_fact_source_changed"); }
        });
    }

    private List<Entry> entries(byte[] transfer, byte[] attempt, long last, TransferHeader header) throws Exception {
        List<Entry> result = new ArrayList<>();
        HashSet<FactIdentity> identities = new HashSet<>();
        ProtocolMessage previous = null;
        long first = -1;
        for (long sequence = 0; sequence <= last; sequence++) {
            byte[] encoded = frames.plaintext(transfer, attempt, sequence);
            ProtocolMessage message = encoded == null ? ProtocolMessage.getDefaultInstance() : ProtocolMessage.parseFrom(encoded);
            FramedSyncFactFragments.continuation(previous, message);
            previous = message;
            if (message.hasFactFragment() && message.getFactFragment().getOffset() == 0) first = sequence;
            FactRecord fact = message.hasFact() ? message.getFact() : null;
            if (message.hasFactFragment() && FramedSyncFactFragments.complete(message.getFactFragment())) {
                fact = FramedSyncFactFragments.assemble(first, sequence, value -> frames.plaintext(transfer, attempt, value));
            }
            if (fact == null) continue;
            validate(header, fact);
            if (!identities.add(fact.getIdentity())) throw new FramedSyncValidationException("inbound_fact_identity_conflict");
            result.add(new Entry(fact.getIdentity(), message.hasFact() ? sequence : first, sequence));
            if (result.size() > FramedSyncContract.MAX_FACTS_PER_TRANSFER) throw new FramedSyncValidationException("canonical_manifest_item_limit_exceeded");
        }
        if (result.size() != header.getManifest().getFactsCount()) throw new FramedSyncValidationException("inbound_facts_incomplete");
        return result;
    }

    private FactRecord read(byte[] transfer, byte[] attempt, Entry entry) throws Exception {
        if (entry.first == entry.last) return ProtocolMessage.parseFrom(frames.plaintext(transfer, attempt, entry.first)).getFact();
        return FramedSyncFactFragments.assemble(entry.first, entry.last, sequence -> frames.plaintext(transfer, attempt, sequence));
    }

    private static void validate(TransferHeader header, FactRecord fact) throws Exception {
        for (var declared : header.getManifest().getFactsList()) {
            if (!declared.getIdentity().equals(fact.getIdentity())) continue;
            var required = new HashSet<com.google.protobuf.ByteString>();
            for (var blob : fact.getBlobsList()) if (blob.getRequired()) required.add(blob.getSha256());
            if (!declared.getSharedStateHash().equals(fact.getSharedStateHash()) ||
                !required.equals(new HashSet<>(declared.getRequiredBlobHashesList()))) {
                throw new FramedSyncValidationException("inbound_manifest_header_mismatch");
            }
            return;
        }
        throw new FramedSyncValidationException("inbound_fact_undeclared");
    }

    private static final class Entry {
        final FactIdentity identity;
        final long first;
        final long last;
        Entry(FactIdentity identity, long first, long last) { this.identity = identity; this.first = first; this.last = last; }
    }
}
