package com.foliole.android.framed;

import com.foliole.sync.v22.InventoryBegin;
import com.foliole.sync.v22.InventoryChunk;
import com.foliole.sync.v22.InventoryEnd;
import com.foliole.sync.v22.InventoryEntry;
import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.ByteString;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class FramedSyncInventoryWire {
    public static final int CHUNK_SIZE = 128;
    public static final int MAX_SESSION_FRAMES =
        (FramedSyncContract.MAX_FACTS_PER_TRANSFER + CHUNK_SIZE - 1) / CHUNK_SIZE + 2;

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
        ByteArrayOutputStream chunks = new ByteArrayOutputStream();
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
            chunks.write(FramedSyncCodec.encode(message));
        }
        InventoryEnd end = (InventoryEnd) messages.get(messages.size() - 1).payload().value();
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(chunks.toByteArray());
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
        if (entries.size() > FramedSyncContract.MAX_FACTS_PER_TRANSFER ||
            roundId == null || roundId.length != FramedSyncContract.IDENTIFIER_BYTES) {
            throw new IllegalArgumentException("inventory_input_invalid");
        }
        List<FramedSyncValidatedMessage> result = new ArrayList<>();
        result.add(validated(ProtocolMessage.newBuilder().setInventoryBegin(
            InventoryBegin.newBuilder().setRoundId(ByteString.copyFrom(roundId))
                .setEntryCount(entries.size())).build()));
        ByteArrayOutputStream chunks = new ByteArrayOutputStream();
        for (int offset = 0, index = 0; offset < entries.size(); offset += CHUNK_SIZE, index++) {
            ProtocolMessage wire = ProtocolMessage.newBuilder().setInventoryChunk(
                InventoryChunk.newBuilder().setRoundId(ByteString.copyFrom(roundId))
                    .setChunkIndex(index)
                    .addAllEntries(entries.subList(offset, Math.min(offset + CHUNK_SIZE, entries.size()))))
                .build();
            FramedSyncValidatedMessage message = validated(wire);
            chunks.write(FramedSyncCodec.encode(message));
            result.add(message);
        }
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(chunks.toByteArray());
        result.add(validated(ProtocolMessage.newBuilder().setInventoryEnd(
            InventoryEnd.newBuilder().setRoundId(ByteString.copyFrom(roundId))
                .setInventoryHash(ByteString.copyFrom(hash))).build()));
        return Collections.unmodifiableList(result);
    }

    private static FramedSyncValidatedMessage validated(ProtocolMessage message) throws Exception {
        return FramedSyncCodec.validateOutbound(
            message, FramedSyncFrameType.SESSION_CONTROL.wireValue());
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
