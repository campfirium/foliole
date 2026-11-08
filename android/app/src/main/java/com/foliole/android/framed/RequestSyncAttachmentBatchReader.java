package com.foliole.android.framed;

import java.util.List;

/** Reads one authenticated session, advancing its write permission at each member terminator. */
public final class RequestSyncAttachmentBatchReader {
    public interface Member extends AutoCloseable {
        void append(long offset, byte[] bytes) throws Exception;
        void close() throws Exception;
    }

    public interface Destination {
        Member open(AttachmentReceiveAuthorization permission) throws Exception;
        void completed(int index, AttachmentReceiveAuthorization permission) throws Exception;
    }

    private final FramedSyncStreamReader stream;
    private final byte[] key;
    private final FramedSyncPreamble preamble;
    private int sequence;
    private long wireBytes;

    public RequestSyncAttachmentBatchReader(FramedSyncStreamReader stream, byte[] key, FramedSyncSessionContext context)
        throws Exception {
        this.stream = stream;
        this.key = key;
        preamble = stream.readPreamble();
        context.validate(preamble);
        wireBytes = preamble.encoded().length;
    }

    public void read(List<AttachmentReceiveAuthorization> permissions, Destination destination,
        RequestSyncAttachmentResponseReader.Check check) throws Exception {
        for (int index = 0; index < permissions.size(); index++) {
            check.run();
            var permission = permissions.get(index);
            readMember(permission, destination, check, index == permissions.size() - 1);
            destination.completed(index, permission);
        }
    }

    private void readMember(AttachmentReceiveAuthorization permission, Destination destination,
        RequestSyncAttachmentResponseReader.Check check, boolean last) throws Exception {
        byte[] tail = null;
        long tailOffset = 0;
        try (var file = destination.open(permission)) {
            for (int frame = 0; frame <= permission.maxBlocks; frame++) {
                check.run();
                var attachment = nextAttachment();
                long offset = permission.offset();
                if (!permission.accept(attachment, true)) {
                    if (last) {
                        try (var extra = stream.readFrame(512 * 1024 + 24_584 + 16)) {
                            if (extra != null) throw invalid("attachment_batch_trailing_frame");
                        }
                    }
                    if (tail != null) {
                        if (permission.pending()) throw invalid("attachment_batch_pending_complete");
                        check.run();
                        file.append(tailOffset, tail);
                    }
                    return;
                }
                byte[] bytes = attachment.getData().toByteArray();
                if (permission.offset() == permission.byteLength) {
                    tail = bytes;
                    tailOffset = offset;
                } else {
                    check.run();
                    file.append(offset, bytes);
                }
            }
        }
        throw invalid("attachment_batch_missing_end");
    }

    private com.foliole.sync.v22.RequestAttachment nextAttachment() throws Exception {
        try (var frame = stream.readFrame(512 * 1024 + 24_584 + 16)) {
            if (frame == null) throw FramedSyncStreamReader.interrupted("attachment_batch_incomplete");
            wireBytes += frame.headerBytes().length + frame.header().ciphertextBytes();
            if (wireBytes > 10 * 1024 * 1024) throw invalid("attachment_batch_wire_limit");
            var plaintext = FramedSyncFrameCrypto.decrypt(key, preamble, frame, sequence++);
            var message = FramedSyncCodec.decode(plaintext, frame.header().frameType()).wireMessage();
            if (!message.hasRequestAttachment() || plaintext.length - message.getRequestAttachment().getData().size() > 24_584) {
                throw invalid("attachment_batch_response_invalid");
            }
            return message.getRequestAttachment();
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
