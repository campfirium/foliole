package com.foliole.android.framed;

import android.content.Context;
import java.nio.ByteBuffer;
import java.util.Arrays;
import org.json.JSONObject;

public final class FramedSyncOutboundFiles implements AutoCloseable, FramedSyncOutboundStaging {
    private final FramedSyncFiles files;
    private final FramedSyncPayloadBudget budget;

    public FramedSyncOutboundFiles(Context context) throws Exception { this(context, FramedSyncPayloadBudgetRegistry.current()); }
    public FramedSyncOutboundFiles(Context context, FramedSyncPayloadBudget budget) throws Exception {
        if (budget.isClosed() || budget != FramedSyncPayloadBudgetRegistry.current()) throw invalid("framed_sync_file_owner_mismatch");
        this.budget = budget;
        files = new FramedSyncFiles(context, budget.libraryKey());
    }

    @Override public synchronized FramedSyncStageOutcome prepareOutboundAttempt(byte[] transfer, byte[] attempt, byte[] encoded) throws Exception {
        var preamble = binding(transfer, attempt, encoded);
        String key = directory(transfer, attempt) + "/attempt.json";
        JSONObject prior = FramedSyncFileRecords.read(files, key);
        if (prior != null) {
            if (!Arrays.equals(FramedSyncFileRecords.bytes(prior.getJSONArray("preamble")), encoded)) throw invalid("outbound_attempt_identity_conflict");
            return FramedSyncStageOutcome.IDENTICAL;
        }
        FramedSyncFileRecords.write(files, key, new JSONObject().put("attemptId", FramedSyncFileRecords.bytes(attempt))
            .put("noncePrefix", FramedSyncFileRecords.bytes(preamble.noncePrefix())).put("preamble", FramedSyncFileRecords.bytes(encoded))
            .put("state", "prepared").put("frameCount", 0));
        return FramedSyncStageOutcome.CREATED;
    }

    @Override public synchronized FramedSyncStageOutcome commitOutboundFrame(FramedSyncAuthenticatedFrame frame) throws Exception {
        binding(frame.transferId(), frame.attemptId(), frame.preamble());
        String directory = directory(frame.transferId(), frame.attemptId());
        JSONObject attempt = FramedSyncFileRecords.read(files, directory + "/attempt.json");
        if (attempt == null || !attempt.getString("state").equals("prepared") ||
            !Arrays.equals(FramedSyncFileRecords.bytes(attempt.getJSONArray("preamble")), frame.preamble())) throw invalid("outbound_attempt_not_prepared");
        var header = FramedSyncWireHeader.decode(frame.frameHeader());
        if (header.ciphertextBytes() != frame.borrowedCiphertext().length) throw invalid("outbound_frame_length_mismatch");
        String key = directory + "/frames/" + Long.toUnsignedString(header.sequence()) + ".frame";
        byte[] value = ByteBuffer.allocate(16 + frame.borrowedCiphertext().length).put(frame.frameHeader()).put(frame.borrowedCiphertext()).array();
        byte[] prior = files.read(key);
        if (prior != null) {
            if (!Arrays.equals(prior, value)) throw invalid("outbound_frame_identity_conflict");
            return FramedSyncStageOutcome.IDENTICAL;
        }
        files.write(key, value);
        return FramedSyncStageOutcome.CREATED;
    }

    @Override public synchronized FramedSyncStageOutcome finalizeOutboundAttempt(byte[] transfer, byte[] attempt) throws Exception {
        String directory = directory(transfer, attempt);
        JSONObject record = FramedSyncFileRecords.read(files, directory + "/attempt.json");
        if (record == null) throw invalid("outbound_attempt_missing");
        if (record.getString("state").equals("replayable")) return FramedSyncStageOutcome.IDENTICAL;
        if (!record.getString("state").equals("prepared")) throw invalid("outbound_attempt_not_prepared");
        int count = files.list(directory + "/frames").length;
        int lastType = -1;
        for (int sequence = 0; sequence < count; sequence++) {
            byte[] value = readFrame(directory, sequence);
            lastType = FramedSyncWireHeader.decode(Arrays.copyOfRange(value, 0, 16)).frameType();
        }
        if (count == 0 || lastType != FramedSyncFrameType.TRANSFER_TRAILER.wireValue()) throw invalid("outbound_transfer_trailer_required");
        FramedSyncFileRecords.write(files, directory + "/attempt.json", record.put("state", "replayable").put("frameCount", count));
        return FramedSyncStageOutcome.CREATED;
    }

    @Override public void replayOutboundFrames(byte[] transfer, byte[] attempt, FramedSyncStreamWriter writer) throws Exception {
        String directory = directory(transfer, attempt);
        JSONObject record = FramedSyncFileRecords.read(files, directory + "/attempt.json");
        if (record == null || !record.getString("state").equals("replayable")) throw invalid("outbound_attempt_not_replayable");
        for (int sequence = 0; sequence < record.getInt("frameCount"); sequence++) {
            try (var loan = FramedSyncPayloadBudget.borrow(budget, FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
                byte[] value = readFrame(directory, sequence);
                writer.writeFrame(Arrays.copyOfRange(value, 0, 16), Arrays.copyOfRange(value, 16, value.length));
            }
        }
    }

    public synchronized FramedSyncTransferWriter.Attempt loadLatestReplayableAttempt(byte[] transfer) throws Exception {
        String directory = base(transfer);
        for (String id : files.list(directory)) {
            if (!id.matches("[a-f0-9]{32}")) throw invalid("outbound_attempt_identity_conflict");
            JSONObject record = FramedSyncFileRecords.read(files, directory + "/" + id + "/attempt.json");
            if (record == null || !record.getString("state").equals("replayable")) continue;
            byte[] attempt = FramedSyncFileRecords.bytes(record.getJSONArray("attemptId"));
            byte[] preamble = FramedSyncFileRecords.bytes(record.getJSONArray("preamble"));
            binding(transfer, attempt, preamble);
            if (!id.equals(FramedSyncResourceFiles.hex(attempt))) throw invalid("outbound_attempt_identity_conflict");
            return new FramedSyncTransferWriter.Attempt(transfer, attempt, preamble);
        }
        return null;
    }

    public synchronized void discardOutboundAttempts(byte[] transfer) throws Exception { files.remove(base(transfer)); }
    @Override public void close() {}

    private byte[] readFrame(String directory, int sequence) throws Exception {
        byte[] value = files.read(directory + "/frames/" + sequence + ".frame");
        if (value == null || value.length < 16) throw invalid("outbound_frame_sequence_not_contiguous");
        var header = FramedSyncWireHeader.decode(Arrays.copyOfRange(value, 0, 16));
        if (header.sequence() != sequence || header.ciphertextBytes() != value.length - 16) throw invalid("outbound_frame_file_invalid");
        return value;
    }

    private static FramedSyncPreamble binding(byte[] transfer, byte[] attempt, byte[] encoded) throws Exception {
        var preamble = FramedSyncPreamble.decode(encoded);
        if (preamble.contextKind() != 2 || preamble.startingSequence() != 0 ||
            !Arrays.equals(preamble.contextId(), transfer) || !Arrays.equals(preamble.identifier(), attempt)) throw invalid("outbound_attempt_binding_mismatch");
        return preamble;
    }
    private static String base(byte[] transfer) {
        FramedSyncFileRecords.directory(transfer);
        return "attempts/" + FramedSyncResourceFiles.hex(transfer) + "/transfer";
    }
    private static String directory(byte[] transfer, byte[] attempt) {
        FramedSyncFileRecords.attempt(transfer, attempt);
        return base(transfer) + "/" + FramedSyncResourceFiles.hex(attempt);
    }
    private static FramedSyncValidationException invalid(String code) { return new FramedSyncValidationException(code); }
}
