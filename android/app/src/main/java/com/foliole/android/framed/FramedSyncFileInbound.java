package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferTrailer;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import org.json.JSONObject;

final class FramedSyncFileInbound {
    private final FramedSyncFiles files;
    private final FramedSyncFileFrames frames;
    private final FramedSyncFileBlobs blobs;
    private final FramedSyncTransferContext context;
    private byte[] retainedTransfer;
    private byte[] retainedAttempt;
    private byte[] incomingAttempt;
    private TransferHeader incomingHeader;

    FramedSyncFileInbound(FramedSyncFiles files, File resources, FramedSyncTransferContext context) {
        this.files = files;
        this.context = context;
        frames = new FramedSyncFileFrames(files);
        blobs = new FramedSyncFileBlobs(files, resources);
    }

    FramedSyncStageOutcome admit(TransferProposal proposal) throws Exception {
        JSONObject value = FramedSyncFileRecords.proposal(proposal, context);
        String key = FramedSyncFileRecords.directory(proposal.getTransferId().toByteArray()) + "/transfer.json";
        JSONObject prior = FramedSyncFileRecords.read(files, key);
        if (prior != null) {
            if (!FramedSyncFileRecords.same(prior.getJSONObject("proposal"), value)) throw invalid("inbound_proposal_conflict");
            if (prior.has("receipt") || prior.optString("state").equals("ready_to_apply")) {
                retainedTransfer = proposal.getTransferId().toByteArray();
                retainedAttempt = FramedSyncFileRecords.bytes(prior.getJSONObject("header").getJSONArray("attemptId"));
            }
            return FramedSyncStageOutcome.IDENTICAL;
        }
        FramedSyncFileRecords.write(files, key, new JSONObject().put("proposal", value)
            .put("reservationId", UUID.randomUUID().toString()).put("state", "proposed"));
        return FramedSyncStageOutcome.CREATED;
    }

    FramedSyncStageOutcome commit(FramedSyncAuthenticatedFrame frame, FramedSyncValidatedMessage message) throws Exception {
        boolean retained = Arrays.equals(retainedTransfer, frame.transferId());
        String key = FramedSyncFileRecords.directory(frame.transferId()) + "/transfer.json";
        JSONObject record = FramedSyncFileRecords.read(files, key);
        if (record == null) throw invalid("inbound_proposal_required");
        if (retained) {
            if (message.wireMessage().hasTransferHeader()) {
                incomingHeader = message.wireMessage().getTransferHeader();
                incomingAttempt = frame.attemptId();
                var expected = FramedSyncFileRecords.header(incomingHeader, record.getJSONObject("proposal"), record.getString("reservationId"));
                var prior = new JSONObject(record.getJSONObject("header").toString());
                prior.put("attemptId", FramedSyncFileRecords.bytes(frame.attemptId()));
                if (!FramedSyncFileRecords.same(prior, expected)) throw invalid("inbound_header_identity_conflict");
            }
            record.getJSONObject("header").put("attemptId", FramedSyncFileRecords.bytes(frame.attemptId()));
        } else if (message.wireMessage().hasTransferHeader()) {
            prepareHeader(frame, message.wireMessage().getTransferHeader(), record, key);
        }
        var declared = record.getJSONObject("header");
        if (!Arrays.equals(FramedSyncFileRecords.bytes(declared.getJSONArray("attemptId")), frame.attemptId())) {
            throw invalid("inbound_attempt_unavailable");
        }
        long sequence = FramedSyncWireHeader.decode(frame.frameHeader()).sequence();
        if (sequence > 0) {
            byte[] previous = frames.plaintext(frame.transferId(), frame.attemptId(), sequence - 1);
            FramedSyncFactFragments.continuation(previous == null ? null : ProtocolMessage.parseFrom(previous), message.wireMessage());
        }
        if (message.wireMessage().hasBlobChunk()) blobs.stage(frame.transferId(), frame.attemptId(), header(frame), message.wireMessage().getBlobChunk());
        FramedSyncStageOutcome outcome = frames.commit(frame, message.wireMessage().hasBlobChunk());
        if (message.wireMessage().hasTransferTrailer()) finalizeAttempt(frame, message.wireMessage().getTransferTrailer(), record, key);
        return outcome;
    }

    void invalidate(byte[] transfer, byte[] attempt) throws Exception {
        String key = FramedSyncFileRecords.directory(transfer) + "/transfer.json";
        JSONObject record = FramedSyncFileRecords.read(files, key);
        if (record == null || record.optString("state").equals("ready_to_apply") || record.has("receipt")) return;
        JSONObject header = record.optJSONObject("header");
        if (header == null || !Arrays.equals(FramedSyncFileRecords.bytes(header.getJSONArray("attemptId")), attempt)) return;
        byte[] first = files.read(frames.key(transfer, attempt, 0)) == null
            ? null : frames.plaintext(transfer, attempt, 0);
        if (first != null) blobs.discardResources(transfer, attempt, ProtocolMessage.parseFrom(first).getTransferHeader());
        record.remove("header");
        record.remove("verifiedManifest");
        record.put("state", "proposed");
        FramedSyncFileRecords.write(files, key, record);
        files.remove(FramedSyncFileRecords.attempt(transfer, attempt));
    }

    private void prepareHeader(FramedSyncAuthenticatedFrame frame, TransferHeader header, JSONObject record, String key) throws Exception {
        JSONObject prior = record.optJSONObject("header");
        if (prior != null) {
            byte[] attempt = FramedSyncFileRecords.bytes(prior.getJSONArray("attemptId"));
            if (Arrays.equals(attempt, frame.attemptId())) return;
            if (record.optString("state").equals("ready_to_apply") || record.has("receipt")) {
                throw invalid("inbound_active_attempt_conflict");
            }
            invalidate(frame.transferId(), attempt);
        }
        JSONObject proposal = record.getJSONObject("proposal");
        long total = 0;
        for (var blob : header.getManifest().getBlobsList()) total += blob.getByteLength();
        if (!Arrays.equals(FramedSyncFileRecords.bytes(proposal.getJSONArray("contentId")), header.getManifest().getContentId().toByteArray()) ||
            Long.parseUnsignedLong(proposal.getString("factCount")) != header.getManifest().getFactsCount() ||
            Long.parseUnsignedLong(proposal.getString("blobCount")) != header.getManifest().getBlobsCount() ||
            Long.parseUnsignedLong(proposal.getString("totalBlobBytes")) != total) throw invalid("inbound_header_proposal_mismatch");
        JSONObject declared = FramedSyncFileRecords.header(header, proposal, record.getString("reservationId"));
        record.put("header", declared).put("state", "receiving");
        record.remove("verifiedManifest");
        FramedSyncFileRecords.write(files, key, record);
        files.write(FramedSyncFileRecords.attempt(frame.transferId(), frame.attemptId()) + "/offers.json",
            declared.getJSONArray("blobs").toString().getBytes(StandardCharsets.UTF_8));
    }

    private void finalizeAttempt(FramedSyncAuthenticatedFrame frame, TransferTrailer trailer, JSONObject record, String key) throws Exception {
        TransferHeader header = header(frame);
        long sequence = FramedSyncWireHeader.decode(frame.frameHeader()).sequence();
        byte[] hash = new FramedSyncFileFacts(files).contentId(frame.transferId(), frame.attemptId(), sequence, header);
        if (trailer.getFactCount() != header.getManifest().getFactsCount() || trailer.getBlobCount() != header.getManifest().getBlobsCount() ||
            !Arrays.equals(hash, trailer.getManifestHash().toByteArray()) || !Arrays.equals(hash, header.getManifest().getContentId().toByteArray())) {
            throw invalid("inbound_attempt_manifest_mismatch");
        }
        blobs.promote(frame.transferId(), frame.attemptId(), header);
        if (!Arrays.equals(retainedTransfer, frame.transferId())) {
            record.put("verifiedManifest", FramedSyncFileRecords.bytes(hash)).put("state", "ready_to_apply");
            FramedSyncFileRecords.write(files, key, record);
        }
    }

    void releaseRetainedRetry() throws Exception {
        if (incomingAttempt == null || Arrays.equals(retainedAttempt, incomingAttempt)) return;
        if (incomingHeader != null) blobs.discardResources(retainedTransfer, incomingAttempt, incomingHeader);
        files.remove(FramedSyncFileRecords.attempt(retainedTransfer, incomingAttempt));
    }

    private TransferHeader header(FramedSyncAuthenticatedFrame frame) throws Exception {
        return ProtocolMessage.parseFrom(frames.plaintext(frame.transferId(), frame.attemptId(), 0)).getTransferHeader();
    }

    private static FramedSyncValidationException invalid(String code) { return new FramedSyncValidationException(code); }
}
