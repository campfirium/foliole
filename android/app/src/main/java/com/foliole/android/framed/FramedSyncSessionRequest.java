package com.foliole.android.framed;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import com.foliole.sync.v22.DifferenceRequest;
import com.google.protobuf.ByteString;

/** Dispatch only after the entire authenticated request has passed its original session checks. */
public final class FramedSyncSessionRequest {
    private final FramedSyncInventoryReader inventory = new FramedSyncInventoryReader(false);
    private final List<byte[]> differences = new ArrayList<>();
    private final HashSet<List<String>> objects = new HashSet<>();
    private ByteString differenceRound;
    private int differenceBytes;
    private boolean resourceRequest;
    private int count;

    private FramedSyncSessionRequest() throws Exception {}

    public static FramedSyncSessionRequest read(InputStream input, byte[] groupKey,
        FramedSyncSessionContext context) throws Exception {
        return read(new FramedSyncStreamReader(input), groupKey, context);
    }

    public static FramedSyncSessionRequest read(InputStream input, byte[] groupKey,
        FramedSyncSessionContext context, FramedSyncPayloadBudget budget) throws Exception {
        return read(new FramedSyncStreamReader(input).budgeted(budget,
            FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD), groupKey, context);
    }

    private static FramedSyncSessionRequest read(FramedSyncStreamReader reader, byte[] groupKey,
        FramedSyncSessionContext context) throws Exception {
        FramedSyncSessionRequest request = new FramedSyncSessionRequest();
        FramedSyncSessionReader.readEachEncoded(reader, groupKey, context,
            FramedSyncInventoryWire.MAX_SESSION_FRAMES, request::accept);
        if (request.differences.isEmpty()) request.inventory.roundId();
        return request;
    }

    private void accept(FramedSyncValidatedMessage message, int encodedBytes) throws Exception {
        if (message.payload().payloadCase() == FramedSyncPayload.Case.DIFFERENCE_REQUEST) {
            acceptDifference(message, encodedBytes);
        } else {
            if (!differences.isEmpty()) throw invalid();
            inventory.accept(message);
        }
        count++;
    }

    private void acceptDifference(FramedSyncValidatedMessage message, int encodedBytes) throws Exception {
        if (count != differences.size() || differences.size() == FramedSyncTransferSequence.MAX_ITEMS) throw invalid();
        var value = (DifferenceRequest) message.payload().value();
        boolean resources = value.getResourcesCount() != 0;
        if (!differences.isEmpty() && (resourceRequest || resources || objects.size() != differences.size() || value.getFactsCount() == 0 || !value.getRoundId().equals(differenceRound))) throw invalid();
        if (value.getFactsCount() != 0) {
            var first = value.getFacts(0);
            var identity = List.of(first.getObjectType(), first.getGlobalId());
            for (var fact : value.getFactsList()) if (!identity.equals(List.of(fact.getObjectType(), fact.getGlobalId()))) throw invalid();
            if (!objects.add(identity)) throw invalid();
        }
        byte[] encoded = FramedSyncCodec.encode(message);
        if (differenceBytes + encodedBytes > FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES) throw invalid();
        differenceBytes += encodedBytes;
        differenceRound = value.getRoundId();
        resourceRequest = resources;
        differences.add(encoded);
    }

    public boolean isDifference() { return !differences.isEmpty(); }
    public int differenceCount() { return differences.size(); }
    public byte[] differenceBytes(int index) { return differences.get(index).clone(); }

    public byte[] differenceBytes() throws Exception {
        if (differences.size() != 1) throw invalid();
        return differenceBytes(0);
    }

    public byte[] roundId() throws Exception { return inventory.roundId(); }

    private static FramedSyncValidationException invalid() {
        return new FramedSyncValidationException("framed_sync_session_request_invalid");
    }
}
