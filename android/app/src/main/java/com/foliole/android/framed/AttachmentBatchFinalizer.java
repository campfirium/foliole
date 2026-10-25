package com.foliole.android.framed;

import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.Callable;

/** Hashing holds only this file's claimed ownership, never a global registry or completion-queue mutex. */
public final class AttachmentBatchFinalizer {
    public interface Commit { boolean run(Callable<Boolean> operation) throws Exception; }
    private final AttachmentBatchReceiver receiver;
    private final String algorithm;
    private final Runnable check, progress;
    private final Commit commit;
    public AttachmentBatchFinalizer(AttachmentBatchReceiver receiver, String algorithm, Runnable check, Runnable progress, Commit commit) {
        this.receiver = receiver; this.algorithm = algorithm; this.check = check; this.progress = progress; this.commit = commit;
    }
    public boolean verify(int sequence) throws Exception {
        try (AutoCloseable active = receiver.begin(sequence)) {
            var file = receiver.file(sequence);
            File path = receiver.store.resolve(file.key, !file.published);
            boolean verified = path.length() == file.length && file.key.substring(0, 64).equals(
                AttachmentFileStore.digest(path, algorithm, check, progress));
            synchronized (receiver) { file.verified = verified; }
            return verified;
        }
    }
    public void publish(int sequence) throws Exception {
        try (AutoCloseable active = receiver.begin(sequence)) {
            var file = receiver.file(sequence);
            if (file.published) return;
            if (!file.verified) throw new IllegalStateException("attachment_verification_required");
            File source = receiver.store.resolve(file.key, true), target = receiver.store.resolve(file.key, false);
            AttachmentFileStore.publish(source, target, file.key.substring(0, 64), algorithm, check, progress, commit::run);
            synchronized (receiver) { file.published = true; }
        }
    }
    public void discard(int sequence) throws Exception {
        try (AutoCloseable active = receiver.begin(sequence)) {
            var file = receiver.file(sequence);
            if (!file.published) { check.run(); Files.deleteIfExists(receiver.store.resolve(file.key, true).toPath()); }
        }
    }
}
