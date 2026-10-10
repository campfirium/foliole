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
        FramedSyncInventoryReader reader = new FramedSyncInventoryReader(false);
        for (FramedSyncValidatedMessage message : messages) reader.accept(message);
        return reader.roundId();
    }

    public static List<InventoryEntry> decodeEntries(
        List<FramedSyncValidatedMessage> messages, byte[] expectedRoundId
    ) throws Exception {
        FramedSyncInventoryReader reader = new FramedSyncInventoryReader(true);
        for (FramedSyncValidatedMessage message : messages) reader.accept(message);
        return reader.entries(expectedRoundId);
    }

    public static List<FramedSyncValidatedMessage> encode(
        List<InventoryEntry> entries, byte[] roundId
    ) throws Exception {
        List<FramedSyncValidatedMessage> result = new ArrayList<>();
        emit(entries, roundId, result::add);
        return Collections.unmodifiableList(result);
    }

    public static void emit(List<InventoryEntry> entries, byte[] roundId,
        FramedSyncSessionWriter.MessageConsumer consumer) throws Exception {
        emit(entries, roundId, List.of(), false, consumer);
    }

    public static void emit(List<InventoryEntry> entries, byte[] roundId, List<String> detailGlobalIds,
        boolean summaryOnly, FramedSyncSessionWriter.MessageConsumer consumer) throws Exception {
        if (summaryOnly) entries = entries.stream().map(entry -> entry.getObjectType().equals("node") ?
            entry.toBuilder().clearFrontierFactIds().clearRequiredRelationIds().clearReviewFactIds()
                .clearResourceHashes().clearStateFactIds().clearVersionStates().clearCurrentVersionId().build() : entry).toList();
        if (entries.size() > FramedSyncContract.MAX_INVENTORY_ENTRIES ||
            roundId == null || roundId.length != FramedSyncContract.IDENTIFIER_BYTES) {
            throw new IllegalArgumentException("inventory_input_invalid");
        }
        consumer.accept(validated(ProtocolMessage.newBuilder().setInventoryBegin(
            InventoryBegin.newBuilder().setRoundId(ByteString.copyFrom(roundId))
                .setEntryCount(entries.size()).addAllDetailGlobalIds(detailGlobalIds).setSummaryOnly(summaryOnly)).build()));
        MessageDigest chunks = MessageDigest.getInstance("SHA-256");
        long bytes = 0;
        for (int offset = 0, index = 0; offset < entries.size(); index++) {
            int count = pageCount(entries, roundId, offset, index);
            ProtocolMessage wire = chunk(entries, roundId, offset, count, index);
            FramedSyncValidatedMessage message = validated(wire);
            byte[] encoded = FramedSyncCodec.encode(message);
            bytes += encoded.length + 32;
            if (bytes > FramedSyncContract.MAX_SESSION_BYTES || index + 3 > MAX_SESSION_FRAMES) {
                throw invalid("inventory_session_limit_exceeded");
            }
            chunks.update(encoded);
            consumer.accept(message);
            offset += count;
        }
        byte[] hash = chunks.digest();
        consumer.accept(validated(ProtocolMessage.newBuilder().setInventoryEnd(
            InventoryEnd.newBuilder().setRoundId(ByteString.copyFrom(roundId))
                .setInventoryHash(ByteString.copyFrom(hash))).build()));
    }

    private static int pageCount(List<InventoryEntry> entries, byte[] roundId, int offset, int index)
        throws FramedSyncValidationException {
        int maximum = Math.min(CHUNK_SIZE, entries.size() - offset);
        if (fits(entries, roundId, offset, maximum, index)) return maximum;
        int low = 1;
        int high = maximum - 1;
        int accepted = 0;
        while (low <= high) {
            int count = low + (high - low) / 2;
            if (fits(entries, roundId, offset, count, index)) {
                accepted = count;
                low = count + 1;
            } else {
                high = count - 1;
            }
        }
        if (accepted == 0) throw invalid("inventory_frame_limit_exceeded");
        return accepted;
    }

    private static boolean fits(List<InventoryEntry> entries, byte[] roundId, int offset,
        int count, int index) {
        return chunk(entries, roundId, offset, count, index).getSerializedSize() <=
            FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES;
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
