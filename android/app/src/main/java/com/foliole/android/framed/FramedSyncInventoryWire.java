package com.foliole.android.framed;

import com.foliole.sync.v22.InventoryBegin;
import com.foliole.sync.v22.InventoryChunk;
import com.foliole.sync.v22.InventoryEnd;
import com.foliole.sync.v22.InventoryEntry;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class FramedSyncInventoryWire {
    public static final int CHUNK_SIZE = 128;
    public static final int MAX_SESSION_FRAMES = FramedSyncContract.MAX_SESSION_FRAMES;

    private FramedSyncInventoryWire() {}

    public static byte[] decodeRoundId(List<FramedSyncValidatedMessage> messages)
        throws Exception {
        if (messages.size() < 2 || messages.size() > MAX_SESSION_FRAMES ||
            messages.get(0).payload().payloadCase() != FramedSyncPayload.Case.INVENTORY_BEGIN ||
            messages.get(messages.size() - 1).payload().payloadCase() !=
                FramedSyncPayload.Case.INVENTORY_END) {
            throw invalid("inventory_exchange_incomplete");
        }
        InventoryBegin begin = (InventoryBegin) messages.get(0).payload().value();
        byte[] roundId = begin.getRoundId().toByteArray();
        long entries = 0;
        MessageDigest chunks = MessageDigest.getInstance("SHA-256");
        long bytes = 0;
        for (int index = 1; index < messages.size() - 1; index++) {
            FramedSyncValidatedMessage message = messages.get(index);
            if (message.payload().payloadCase() != FramedSyncPayload.Case.INVENTORY_CHUNK) {
                throw invalid("inventory_exchange_incomplete");
            }
            InventoryChunk chunk = (InventoryChunk) message.payload().value();
            if (!MessageDigest.isEqual(roundId, chunk.getRoundId().toByteArray()) ||
                Integer.toUnsignedLong(chunk.getChunkIndex()) != index - 1L) {
                throw invalid("inventory_chunk_sequence_invalid");
            }
            entries += chunk.getEntriesCount();
            if (entries > begin.getEntryCount() || entries > FramedSyncContract.MAX_INVENTORY_ENTRIES) {
                throw invalid("inventory_entry_limit_exceeded");
            }
            byte[] encoded = FramedSyncCodec.encode(message);
            bytes += encoded.length + 32;
            if (bytes > FramedSyncContract.MAX_SESSION_BYTES) throw invalid("inventory_session_limit_exceeded");
            chunks.update(encoded);
        }
        InventoryEnd end = (InventoryEnd) messages.get(messages.size() - 1).payload().value();
        byte[] hash = chunks.digest();
        if (!MessageDigest.isEqual(roundId, end.getRoundId().toByteArray()) ||
            !MessageDigest.isEqual(hash, end.getInventoryHash().toByteArray()) ||
            entries != begin.getEntryCount()) throw invalid("inventory_exchange_incomplete");
        return roundId;
    }

    public static List<InventoryEntry> decodeEntries(
        List<FramedSyncValidatedMessage> messages,
        byte[] expectedRoundId
    ) throws Exception {
        byte[] roundId = decodeRoundId(messages);
        if (!MessageDigest.isEqual(roundId, expectedRoundId)) {
            throw invalid("inventory_round_identity_mismatch");
        }
        List<InventoryEntry> entries = new ArrayList<>();
        for (int index = 1; index < messages.size() - 1; index++) {
            InventoryChunk chunk = (InventoryChunk) messages.get(index).payload().value();
            entries.addAll(chunk.getEntriesList());
        }
        return Collections.unmodifiableList(entries);
    }

    public static List<FramedSyncValidatedMessage> encode(
        List<InventoryEntry> entries, byte[] roundId
    ) throws Exception {
        if (entries.size() > FramedSyncContract.MAX_INVENTORY_ENTRIES ||
            roundId == null || roundId.length != FramedSyncContract.IDENTIFIER_BYTES) {
            throw new IllegalArgumentException("inventory_input_invalid");
        }
        List<FramedSyncValidatedMessage> result = new ArrayList<>();
        result.add(validated(ProtocolMessage.newBuilder().setInventoryBegin(
            InventoryBegin.newBuilder().setRoundId(ByteString.copyFrom(roundId))
                .setEntryCount(entries.size())).build()));
        MessageDigest chunks = MessageDigest.getInstance("SHA-256");
        long bytes = 0;
        for (int offset = 0, index = 0; offset < entries.size(); index++) {
            int count = Math.min(CHUNK_SIZE, entries.size() - offset);
            ProtocolMessage wire = chunk(entries, roundId, offset, count, index);
            while (wire.getSerializedSize() > FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES && count > 1) {
                count = Math.max(1, count / 2);
                wire = chunk(entries, roundId, offset, count, index);
            }
            FramedSyncValidatedMessage message = validated(wire);
            byte[] encoded = FramedSyncCodec.encode(message);
            bytes += encoded.length + 32;
            if (bytes > FramedSyncContract.MAX_SESSION_BYTES || result.size() + 2 > MAX_SESSION_FRAMES) {
                throw invalid("inventory_session_limit_exceeded");
            }
            chunks.update(encoded);
            result.add(message);
            offset += count;
        }
        byte[] hash = chunks.digest();
        result.add(validated(ProtocolMessage.newBuilder().setInventoryEnd(
            InventoryEnd.newBuilder().setRoundId(ByteString.copyFrom(roundId))
                .setInventoryHash(ByteString.copyFrom(hash))).build()));
        return Collections.unmodifiableList(result);
    }

    private static ProtocolMessage chunk(
        List<InventoryEntry> entries, byte[] roundId, int offset, int count, int index
    ) {
        return ProtocolMessage.newBuilder().setInventoryChunk(
            InventoryChunk.newBuilder().setRoundId(ByteString.copyFrom(roundId)).setChunkIndex(index)
                .addAllEntries(entries.subList(offset, offset + count))).build();
    }

    private static FramedSyncValidatedMessage validated(ProtocolMessage message) throws Exception {
        return FramedSyncCodec.validateOutbound(
            message, FramedSyncFrameType.SESSION_CONTROL.wireValue());
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
