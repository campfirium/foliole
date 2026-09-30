package com.foliole.android;

import static org.junit.Assert.*;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import java.util.Collections;

public final class FolioleCompanionAttachmentCommitRecoveryTest {
    @Test public void failedCommitRestoresCompletedBytesForRetryWithoutNetwork() throws Exception {
        File root = Files.createTempDirectory("foliole-commit-recovery-").toFile();
        File temporary = new File(root, "verified");
        File published = new File(root, "published");
        byte[] bytes = "verified attachment bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try {
            Files.write(temporary.toPath(), bytes);
            String hash = FolioleCompanionAttachmentResourceHash.digestHex(temporary);
            String token = session(temporary, hash);
            Files.move(temporary.toPath(), published.toPath());
            FolioleCompanionAttachmentResourceBatchSessions.markStaged(token, null,
                Collections.singletonMap(hash, published));
            FolioleCompanionAttachmentResourceBatchSessions.finish(token, false);
            assertFalse(published.exists());
            assertArrayEquals(bytes, Files.readAllBytes(temporary.toPath()));
            FolioleCompanionAttachmentRangeDownload.downloadFromRanges(new File(root, "unverified"),
                temporary, hash, offset -> { fail("Completed bytes must not download again"); return null; },
                new FolioleCompanionAttachmentRangeDownload.Checkpoint() {
                    public long load(long total) { throw new AssertionError(); }
                    public void save(long total, long confirmed) { throw new AssertionError(); }
                    public void clear() {}
                });
            String next = session(temporary, hash);
            Files.move(temporary.toPath(), published.toPath());
            FolioleCompanionAttachmentResourceBatchSessions.markStaged(next, null,
                Collections.singletonMap(hash, published));
            FolioleCompanionAttachmentResourceBatchSessions.finish(next, true);
            assertArrayEquals(bytes, Files.readAllBytes(published.toPath()));
        } finally { temporary.delete(); published.delete(); root.delete(); }
    }

    @Test public void failureBeforeStagingRetainsCompletedTemporaryFile() throws Exception {
        File root = Files.createTempDirectory("foliole-commit-recovery-").toFile();
        File temporary = new File(root, "verified");
        byte[] bytes = "verified attachment bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try {
            Files.write(temporary.toPath(), bytes);
            FolioleCompanionAttachmentResourceBatchSessions.finish(session(temporary,
                FolioleCompanionAttachmentResourceHash.digestHex(temporary)), false);
            assertArrayEquals(bytes, Files.readAllBytes(temporary.toPath()));
        } finally { temporary.delete(); root.delete(); }
    }

    private static String session(File temporary, String hash) {
        return FolioleCompanionAttachmentResourceBatchSessions.create(Collections.singletonMap(hash, temporary),
            Collections.singletonMap(hash, hash), Collections.singletonMap(hash, "image/png"),
            Collections.singletonMap(hash, hash + ".png"), Collections.emptyList());
    }

    @Test public void conflictingRecoveryDestinationPreservesBothFilesAndCanRetry() throws Exception {
        File root = Files.createTempDirectory("foliole-commit-conflict-").toFile();
        File temporary = new File(root, "verified"), published = new File(root, "published");
        byte[] bytes = "verified attachment bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try {
            Files.write(published.toPath(), bytes);
            String hash = FolioleCompanionAttachmentResourceHash.digestHex(published);
            String token = session(temporary, hash);
            FolioleCompanionAttachmentResourceBatchSessions.markStaged(token, null,
                Collections.singletonMap(hash, published));
            Files.write(temporary.toPath(), new byte[] {1});
            assertThrows(Exception.class, () -> FolioleCompanionAttachmentResourceBatchSessions.finish(token, false));
            assertArrayEquals(bytes, Files.readAllBytes(published.toPath()));
            assertArrayEquals(new byte[] {1}, Files.readAllBytes(temporary.toPath()));
            assertNotNull(FolioleCompanionAttachmentResourceBatchSessions.get(token));
            Files.delete(temporary.toPath());
            FolioleCompanionAttachmentResourceBatchSessions.finish(token, false);
            assertArrayEquals(bytes, Files.readAllBytes(temporary.toPath()));
        } finally { temporary.delete(); published.delete(); root.delete(); }
    }
}
