package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.RequestAttachment;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

final class AttachmentBatchFileFixture implements AutoCloseable {
    static final byte[] GROUP_KEY = new byte[32];
    static final FramedSyncSessionContext CONTEXT = new FramedSyncSessionContext("group", "a", "a-epoch", "b", "b-epoch");
    final AttachmentFileStore store;
    final AttachmentCompletionCapacity capacity = new AttachmentCompletionCapacity();
    final AttachmentCompletionQueue queue;
    final AttachmentBatchReceiver receiver;
    final AttachmentBatchFinalizer finalizer;
    final List<byte[]> contents = new ArrayList<>();
    final List<AttachmentBatchAuthorization.Entry> entries = new ArrayList<>();
    final List<RequestAttachment> messages = new ArrayList<>();
    AttachmentBatchFileFixture(File root, int count, Runnable changed, Runnable hashProgress) throws Exception {
        store = new AttachmentFileStore(root); queue = new AttachmentCompletionQueue(capacity, changed);
        for (int i = 0; i < count; i++) {
            byte[] bytes = new byte[131072]; bytes[0] = (byte) i;
            StringBuilder key = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) key.append(String.format("%02x", value));
            key.append(".png"); contents.add(bytes);
            entries.add(new AttachmentBatchAuthorization.Entry(key.toString(), 0, 0, 0));
            messages.add(value(key.toString(), "description", bytes.length, 0, ByteString.EMPTY));
            messages.add(value(key.toString(), "block", bytes.length, 0, ByteString.copyFrom(bytes)));
            messages.add(value(key.toString(), "file_end", bytes.length, bytes.length, ByteString.EMPTY));
        }
        messages.add(value("", "batch_end", 0, (long) count * 131072, ByteString.EMPTY));
        receiver = new AttachmentBatchReceiver(store, queue, entries, queue::check);
        finalizer = new AttachmentBatchFinalizer(receiver, "SHA-256", queue::check, () -> {
            capacity.progress(); hashProgress.run();
        }, operation -> { queue.check(); return operation.call(); });
    }
    static RequestAttachment value(String key, String state, long length, long offset, ByteString bytes) {
        return RequestAttachment.newBuilder().setRequestId(ByteString.copyFrom(new byte[16])).setOperation("batch_pull")
            .setStorageKey(key).setState(state).setByteLength(length).setOffset(offset).setData(bytes).setMaxBlocks(1).build();
    }
    byte[] wire() throws Exception {
        var output = new ByteArrayOutputStream();
        FramedSyncSessionWriter.write(GROUP_KEY, CONTEXT, consumer -> {
            for (var value : messages) consumer.accept(FramedSyncCodec.decode(
                ProtocolMessage.newBuilder().setRequestAttachment(value).build().toByteArray(), 1));
        }, (session, context, nonce, sequence) -> {}, output);
        return output.toByteArray();
    }
    void read(byte[] bytes, RequestSyncAttachmentBatchReader.Consumer consume) throws Exception {
        try (receiver) {
            RequestSyncAttachmentBatchReader.read(new FramedSyncStreamReader(new ByteArrayInputStream(bytes)), GROUP_KEY, CONTEXT,
                new AttachmentBatchAuthorization(new byte[16], entries), queue::check, consume);
        }
    }
    void finish(AttachmentCompletionQueue.FileFact fact) throws Exception {
        queue.claim(List.of(fact.sequence));
        if (!finalizer.verify(fact.sequence)) throw new IllegalStateException("test_hash_mismatch");
        finalizer.publish(fact.sequence); receiver.settle(fact.sequence, true);
    }
    @Override public void close() throws Exception {
        receiver.close(); queue.stop(); queue.releaseUnclaimed();
        for (var fact : queue.read()) receiver.settle(fact.sequence, false);
        store.close();
    }
}
