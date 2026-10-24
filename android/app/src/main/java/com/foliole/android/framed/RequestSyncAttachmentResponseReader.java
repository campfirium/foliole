package com.foliole.android.framed;

import com.google.protobuf.ByteString;
import com.foliole.sync.v22.ProtocolMessage;
import java.io.InputStream;

/** Authenticated frame/file primitive. Shared code decides offsets, recovery and publication. */
public final class RequestSyncAttachmentResponseReader {
    private RequestSyncAttachmentResponseReader() {}
    public interface Consumer {
        void accept(int index, byte[] metadata, byte[] block) throws Exception;
    }
    public interface Check { void run() throws Exception; }

    public static byte[] read(InputStream input, byte[] groupKey, FramedSyncSessionContext context,
        Check check, Consumer consume) throws Exception {
        return read(new FramedSyncStreamReader(input), groupKey, context, 32, check, consume);
    }

    public static byte[] read(FramedSyncStreamReader stream, byte[] groupKey, FramedSyncSessionContext context,
        int maxBlocks, Check check, Consumer consume) throws Exception {
        if (maxBlocks < 1 || maxBlocks > 64) throw new FramedSyncValidationException("attachment_response_window_invalid");
        FramedSyncPreamble preamble = stream.readPreamble();
        context.validate(preamble);
        int sequence = 0;
        for (FramedSyncWireFrame frame = stream.readFrame(); frame != null; frame = stream.readFrame()) {
            try (var current = frame) {
                check.run();
                if (sequence >= maxBlocks + 1) throw new FramedSyncValidationException("attachment_response_frame_limit");
                byte[] plaintext = FramedSyncFrameCrypto.decrypt(groupKey, preamble, current, sequence);
                ProtocolMessage message = FramedSyncCodec.decode(plaintext, current.header().frameType()).wireMessage();
                if (!message.hasRequestAttachment()) throw new FramedSyncValidationException("attachment_response_invalid");
                var attachment = message.getRequestAttachment();
                boolean block = attachment.getState().equals("block");
                if ((block && sequence >= maxBlocks) || !attachment.getOperation().equals("pull") ||
                    (block ? attachment.getData().isEmpty() : !attachment.getData().isEmpty())) {
                    throw new FramedSyncValidationException("attachment_response_block_invalid");
                }
                byte[] bytes = attachment.getData().toByteArray();
                byte[] metadata = message.toBuilder().setRequestAttachment(
                    attachment.toBuilder().setData(ByteString.EMPTY)).build().toByteArray();
                if (metadata.length > 24576) throw new FramedSyncValidationException("attachment_response_metadata_limit");
                consume.accept(sequence++, metadata, bytes);
            }
        }
        check.run();
        return preamble.encoded();
    }
}
