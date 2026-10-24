package com.foliole.android.framed;

/** Authenticates and validates every frame before the supplied file writer sees its bytes. */
public final class RequestSyncAttachmentResponseReader {
    private RequestSyncAttachmentResponseReader() {}
    public interface Consumer { void accept(long offset, byte[] block) throws Exception; }
    public interface Check { void run() throws Exception; }

    public static void read(FramedSyncStreamReader stream, byte[] groupKey, FramedSyncSessionContext context,
        AttachmentReceiveAuthorization permission, Check check, Consumer consume) throws Exception {
        FramedSyncPreamble preamble = stream.readPreamble();
        context.validate(preamble);
        int sequence = 0;
        long wireBytes = 96;
        for (FramedSyncWireFrame frame = stream.readFrame(); frame != null; frame = stream.readFrame()) {
            try (var current = frame) {
                check.run();
                wireBytes += 16L + current.header().ciphertextBytes();
                if (sequence >= permission.maxBlocks + 1 || wireBytes > permission.maximumWireBytes()) {
                    throw new FramedSyncValidationException("attachment_response_frame_limit");
                }
                byte[] plaintext = FramedSyncFrameCrypto.decrypt(groupKey, preamble, current, sequence++);
                var message = FramedSyncCodec.decode(plaintext, current.header().frameType()).wireMessage();
                if (!message.hasRequestAttachment()) throw new FramedSyncValidationException("attachment_response_invalid");
                var attachment = message.getRequestAttachment();
                if (plaintext.length - attachment.getData().size() > 24584) {
                    throw new FramedSyncValidationException("attachment_response_metadata_limit");
                }
                long offset = permission.offset();
                if (permission.accept(attachment)) { check.run(); consume.accept(offset, attachment.getData().toByteArray()); }
            }
        }
        check.run(); permission.finish();
    }
}
