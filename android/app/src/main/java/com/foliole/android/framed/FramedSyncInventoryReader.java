package com.foliole.android.framed;

import com.foliole.sync.v22.InventoryBegin;
import com.foliole.sync.v22.InventoryChunk;
import com.foliole.sync.v22.InventoryEnd;
import com.foliole.sync.v22.InventoryEntry;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Validates one decrypted page at a time; the encrypted message list is never retained. */
public final class FramedSyncInventoryReader {
    private final MessageDigest digest = MessageDigest.getInstance("SHA-256");
    private final List<InventoryEntry> entries = new ArrayList<>();
    private final boolean retainEntries;
    private InventoryBegin begin;
    private long count;
    private int index;
    private int frames;
    private long bytes;
    private boolean ended;

    public FramedSyncInventoryReader(boolean retainEntries) throws Exception {
        this.retainEntries = retainEntries;
    }

    public void accept(FramedSyncValidatedMessage message) throws Exception {
        if (ended) throw invalid("inventory_exchange_incomplete");
        byte[] encoded = FramedSyncCodec.encode(message);
        bytes += encoded.length + 32;
        if (++frames > FramedSyncContract.MAX_SESSION_FRAMES || bytes > FramedSyncContract.MAX_SESSION_BYTES) {
            throw invalid("inventory_session_limit_exceeded");
        }
        if (begin == null) {
            if (message.payload().payloadCase() != FramedSyncPayload.Case.INVENTORY_BEGIN) {
                throw invalid("inventory_exchange_incomplete");
            }
            begin = (InventoryBegin) message.payload().value();
            return;
        }
        if (message.payload().payloadCase() == FramedSyncPayload.Case.INVENTORY_CHUNK) {
            InventoryChunk chunk = (InventoryChunk) message.payload().value();
            if (!begin.getRoundId().equals(chunk.getRoundId()) ||
                Integer.toUnsignedLong(chunk.getChunkIndex()) != index++) {
                throw invalid("inventory_chunk_sequence_invalid");
            }
            count += chunk.getEntriesCount();
            if (count > begin.getEntryCount() || count > FramedSyncContract.MAX_INVENTORY_ENTRIES) {
                throw invalid("inventory_entry_limit_exceeded");
            }
            digest.update(encoded);
            if (retainEntries) entries.addAll(chunk.getEntriesList());
            return;
        }
        if (message.payload().payloadCase() != FramedSyncPayload.Case.INVENTORY_END) {
            throw invalid("inventory_exchange_incomplete");
        }
        InventoryEnd end = (InventoryEnd) message.payload().value();
        if (!begin.getRoundId().equals(end.getRoundId()) || count != begin.getEntryCount() ||
            !MessageDigest.isEqual(digest.digest(), end.getInventoryHash().toByteArray())) {
            throw invalid("inventory_exchange_incomplete");
        }
        ended = true;
    }

    public byte[] roundId() throws Exception {
        if (!ended) throw invalid("inventory_exchange_incomplete");
        return begin.getRoundId().toByteArray();
    }

    public InventoryBegin begin() throws Exception { roundId(); return begin; }

    public List<InventoryEntry> entries(byte[] expectedRoundId) throws Exception {
        if (!retainEntries || !MessageDigest.isEqual(roundId(), expectedRoundId)) {
            throw invalid("inventory_round_identity_mismatch");
        }
        return Collections.unmodifiableList(entries);
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
