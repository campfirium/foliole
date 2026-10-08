package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.google.protobuf.ByteString;
import java.io.File;
import java.security.MessageDigest;
import java.util.List;
import java.util.ArrayList;

final class FramedSyncSourceTransferWriter {
    private FramedSyncSourceTransferWriter() {}

    static FramedSyncTransferWriter.Attempt prepare(byte[] groupKey, FramedSyncTransferContext context,
        FramedSyncOutboundFactSource source, List<FramedSyncBlobContent> blobContents,
        FramedSyncOutboundStaging staging, File directory) throws Exception {
        TransferHeader template = source.header();
        FramedSyncCodec.decode(ProtocolMessage.newBuilder().setTransferHeader(template).build().toByteArray(), 2);
        if (template.getManifest().getFactsCount() == 0) throw invalid("framed_sync_fact_set_invalid");
        byte[] transferId = template.getTransferId().toByteArray();
        byte[] attemptId = FramedSyncTransferWriter.random(FramedSyncContract.IDENTIFIER_BYTES);
        FramedSyncPreamble preamble = FramedSyncPreamble.transfer(transferId, attemptId,
            FramedSyncTransferWriter.random(4));
        TransferHeader header = template.toBuilder().setAttemptId(ByteString.copyFrom(attemptId)).build();
        context.proposal(preamble, header);
        List<FramedSyncBlobContent> contents = FramedSyncTransferWriter.verifiedBlobContents(
            header.getManifest().getBlobsList(), blobContents);
        try (FramedSyncOutboundFactSpool spool = new FramedSyncOutboundFactSpool(directory)) {
            verify(source, spool);
            return persist(groupKey, header, preamble, contents, staging, spool, source.budget());
        }
    }

    private static void verify(FramedSyncOutboundFactSource source, FramedSyncOutboundFactSpool spool)
        throws Exception {
        var manifest = source.header().getManifest();
        var verifier = new FramedSyncOutboundFactVerifier(manifest.getBlobsList());
        List<Integer> indices = new ArrayList<>();
        for (int index = 0; index < manifest.getFactsCount(); index++) indices.add(index);
        indices.sort((left, right) -> FramedSyncCanonicalManifest.compareIdentities(
            manifest.getFacts(left).getIdentity(), manifest.getFacts(right).getIdentity()));
        byte[] contentId = FramedSyncCanonicalManifest.contentId(manifest.getFactsCount(),
            manifest.getBlobsList(), index -> {
                try {
                    int sourceIndex = indices.get(index);
                    var fact = spool.freeze(source, sourceIndex);
                    verifier.verify(fact, manifest.getFacts(sourceIndex));
                    return fact;
                } catch (FramedSyncValidationException error) { throw error; }
                catch (Exception error) {
                    throw new FramedSyncValidationException("framed_sync_fact_source_changed");
                }
            });
        verifier.finish();
        if (!MessageDigest.isEqual(contentId, manifest.getContentId().toByteArray())) {
            throw invalid("framed_sync_manifest_identity_mismatch");
        }
    }

    private static FramedSyncTransferWriter.Attempt persist(byte[] groupKey, TransferHeader header,
        FramedSyncPreamble preamble, List<FramedSyncBlobContent> contents,
        FramedSyncOutboundStaging staging, FramedSyncOutboundFactSpool spool,
        FramedSyncPayloadBudget budget) throws Exception {
        byte[] transferId = header.getTransferId().toByteArray();
        byte[] attemptId = header.getAttemptId().toByteArray();
        staging.prepareOutboundAttempt(transferId, attemptId, preamble.encoded());
        long sequence;
        try (var loan = FramedSyncPayloadBudget.borrow(budget,
            FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            sequence = FramedSyncTransferWriter.persist(groupKey, preamble, transferId, attemptId, 0,
                FramedSyncFrameType.TRANSFER_HEADER,
                ProtocolMessage.newBuilder().setTransferHeader(header).build(), staging);
        }
        for (int index = 1; index <= spool.count(); index++) {
            try (var loan = FramedSyncPayloadBudget.borrow(budget,
                FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
                var message = FramedSyncCodec.decode(spool.read(index), 3).wireMessage();
                sequence = FramedSyncTransferWriter.persist(groupKey, preamble, transferId, attemptId,
                    sequence, FramedSyncFrameType.FACT, message, staging);
            }
        }
        var manifest = header.getManifest();
        for (int index = 0; index < contents.size(); index++) {
            sequence = FramedSyncTransferBlobWriter.write(transferId, sequence,
                contents.get(index), manifest.getBlobs(index), (next, message) ->
                    FramedSyncTransferWriter.persist(groupKey, preamble, transferId, attemptId, next,
                        FramedSyncFrameType.BLOB_CHUNK, message, staging), budget);
        }
        try (var loan = FramedSyncPayloadBudget.borrow(budget,
            FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            FramedSyncTransferWriter.persist(groupKey, preamble, transferId, attemptId, sequence,
                FramedSyncFrameType.TRANSFER_TRAILER, FramedSyncTransferWriter.trailer(
                    manifest.getContentId().toByteArray(), transferId, manifest.getFactsCount(),
                    manifest.getBlobsCount()), staging);
        }
        staging.finalizeOutboundAttempt(transferId, attemptId);
        return new FramedSyncTransferWriter.Attempt(transferId, attemptId, preamble.encoded());
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
