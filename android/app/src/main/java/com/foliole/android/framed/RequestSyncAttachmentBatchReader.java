package com.foliole.android.framed;

import com.foliole.sync.v22.RequestAttachment;

/** Authentication and ordered permission checks precede all native file callbacks. */
public final class RequestSyncAttachmentBatchReader {
    private RequestSyncAttachmentBatchReader() {}
    public interface Consumer { void accept(AttachmentBatchAuthorization.Event event, RequestAttachment value) throws Exception; }
    public static void read(FramedSyncStreamReader stream, byte[] groupKey, FramedSyncSessionContext context,
        AttachmentBatchAuthorization permission, RequestSyncAttachmentResponseReader.Check check, Consumer consume) throws Exception {
        FramedSyncPreamble preamble = stream.readPreamble();
        context.validate(preamble);
        int sequence = 0;
        long wireBytes = 96;
        int limit = AttachmentBatchAuthorization.BLOCK_BYTES + 24584 + 16;
        for (FramedSyncWireFrame frame = stream.readFrameWithin(limit); frame != null; frame = stream.readFrameWithin(limit)) {
            try (var current = frame) {
                check.run();
                wireBytes += 16L + current.header().ciphertextBytes();
                if (wireBytes > permission.maximumWireBytes()) throw new FramedSyncValidationException("attachment_batch_wire_limit");
                byte[] plaintext = FramedSyncFrameCrypto.decrypt(groupKey, preamble, current, sequence++);
                var message = FramedSyncCodec.decode(plaintext, current.header().frameType()).wireMessage();
                if (!message.hasRequestAttachment()) throw new FramedSyncValidationException("attachment_response_invalid");
                var value = message.getRequestAttachment();
                var event = permission.accept(value, plaintext.length);
                check.run(); consume.accept(event, value);
            }
        }
        check.run(); permission.finish();
    }
}
