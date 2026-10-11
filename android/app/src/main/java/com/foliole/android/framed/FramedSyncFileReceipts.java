package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferReceipt;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.List;
import org.json.JSONObject;

final class FramedSyncFileReceipts {
    private final FramedSyncFiles files;
    FramedSyncFileReceipts(FramedSyncFiles files) { this.files = files; }

    FramedSyncStageOutcome commit(TransferReceipt receipt) throws Exception {
        JSONObject record = FramedSyncFileRecords.read(files, FramedSyncFileRecords.directory(receipt.getTransferId().toByteArray()) + "/transfer.json");
        JSONObject expected = FramedSyncFileRecords.receipt(receipt);
        if (record == null || !record.has("receipt")) throw invalid("receipt_not_committed");
        JSONObject actual = record.getJSONObject("receipt");
        for (String key : new String[] {"transferId", "contentId", "receiverDeviceId", "receiverLibraryEpoch", "appliedStateHash"}) {
            if (!expected.get(key).toString().equals(actual.get(key).toString())) throw invalid("receipt_identity_conflict");
        }
        return FramedSyncStageOutcome.IDENTICAL;
    }

    FramedSyncStageOutcome prepare(byte[] transfer, byte[] attempt, byte[] encoded) throws Exception {
        var preamble = FramedSyncPreamble.decode(encoded);
        if (preamble.contextKind() != 2 || preamble.startingSequence() != 0 ||
            !Arrays.equals(preamble.contextId(), transfer) || !Arrays.equals(preamble.identifier(), attempt)) throw invalid("outbound_attempt_identity_conflict");
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

    FramedSyncStageOutcome frame(FramedSyncAuthenticatedFrame frame, TransferReceipt receipt) throws Exception {
        commit(receipt);
        String directory = directory(frame.transferId(), frame.attemptId());
        JSONObject attempt = FramedSyncFileRecords.read(files, directory + "/attempt.json");
        var header = FramedSyncWireHeader.decode(frame.frameHeader());
        if (attempt == null || !attempt.getString("state").equals("prepared") || header.sequence() != 0 ||
            !Arrays.equals(FramedSyncFileRecords.bytes(attempt.getJSONArray("preamble")), frame.preamble())) throw invalid("outbound_attempt_not_prepared");
        byte[] value = ByteBuffer.allocate(16 + frame.borrowedCiphertext().length).put(frame.frameHeader()).put(frame.borrowedCiphertext()).array();
        byte[] prior = files.read(directory + "/frames/0.frame");
        if (prior != null) {
            if (!Arrays.equals(prior, value)) throw invalid("outbound_frame_identity_conflict");
            return FramedSyncStageOutcome.IDENTICAL;
        }
        files.write(directory + "/frames/0.frame", value);
        return FramedSyncStageOutcome.CREATED;
    }

    FramedSyncStageOutcome finalizeAttempt(byte[] transfer, byte[] attempt) throws Exception {
        String directory = directory(transfer, attempt);
        JSONObject record = FramedSyncFileRecords.read(files, directory + "/attempt.json");
        if (record == null || files.read(directory + "/frames/0.frame") == null) throw invalid("outbound_frame_count_missing");
        if (record.getString("state").equals("replayable")) return FramedSyncStageOutcome.IDENTICAL;
        if (!record.getString("state").equals("prepared")) throw invalid("outbound_attempt_not_prepared");
        FramedSyncFileRecords.write(files, directory + "/attempt.json", record.put("state", "replayable").put("frameCount", 1));
        return FramedSyncStageOutcome.CREATED;
    }

    List<FramedSyncAuthenticatedFrame> load(byte[] transfer, byte[] attempt) throws Exception {
        String directory = directory(transfer, attempt);
        JSONObject record = FramedSyncFileRecords.read(files, directory + "/attempt.json");
        if (record == null || !record.getString("state").equals("replayable")) throw invalid("outbound_attempt_not_replayable");
        byte[] value = files.read(directory + "/frames/0.frame");
        if (value == null || value.length < 16) throw invalid("outbound_frame_sequence_gap");
        return List.of(new FramedSyncAuthenticatedFrame(transfer, attempt, FramedSyncFileRecords.bytes(record.getJSONArray("preamble")),
            Arrays.copyOfRange(value, 0, 16), Arrays.copyOfRange(value, 16, value.length), new byte[0]));
    }

    private static String directory(byte[] transfer, byte[] attempt) {
        FramedSyncFileRecords.attempt(transfer, attempt);
        return "attempts/" + FramedSyncResourceFiles.hex(transfer) + "/receipt/" + FramedSyncResourceFiles.hex(attempt);
    }
    private static FramedSyncValidationException invalid(String code) { return new FramedSyncValidationException(code); }
}
