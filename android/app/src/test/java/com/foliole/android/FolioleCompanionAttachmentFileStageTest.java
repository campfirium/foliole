package com.foliole.android;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class FolioleCompanionAttachmentFileStageTest {
    @Rule public final TemporaryFolder directory = new TemporaryFolder();

    @Test public void publishesTheVerifiedPartialAndKeepsAnAlreadyValidTarget() throws Exception {
        File partial = directory.newFile("partial");
        File target = new File(directory.getRoot(), "target");
        byte[] bytes = {1, 2, 3};
        Files.write(partial.toPath(), bytes);
        String hash = FolioleCompanionAttachmentResourceHash.digestHex(partial);

        assertTrue(FolioleCompanionAttachmentFileStage.publishReceived(partial, target, hash, bytes.length, () -> {}));
        assertArrayEquals(bytes, Files.readAllBytes(target.toPath()));
        assertFalse(partial.exists());

        Files.write(partial.toPath(), bytes);
        Files.setLastModifiedTime(target.toPath(), java.nio.file.attribute.FileTime.fromMillis(10_000));
        var stamp = Files.getLastModifiedTime(target.toPath());
        assertTrue(FolioleCompanionAttachmentFileStage.publishReceived(partial, target, hash, bytes.length, () -> {}));
        assertFalse(partial.exists());
        assertEquals(stamp, Files.getLastModifiedTime(target.toPath()));
    }

    @Test public void distinguishesBadBytesFromPublicationFailureAndKeepsThePartialOnFailure() throws Exception {
        File partial = directory.newFile("partial");
        File target = directory.newFolder("target");
        directory.newFile("target/keep");
        byte[] bytes = {1, 2, 3};
        Files.write(partial.toPath(), bytes);
        String hash = FolioleCompanionAttachmentResourceHash.digestHex(partial);

        assertFalse(FolioleCompanionAttachmentFileStage.publishReceived(partial, target, "0".repeat(64), 3, () -> {}));
        assertThrows(IOException.class,
            () -> FolioleCompanionAttachmentFileStage.publishReceived(partial, target, hash, 3, () -> {}));
        assertArrayEquals(bytes, Files.readAllBytes(partial.toPath()));
        assertTrue(new File(target, "keep").isFile());
    }

    @Test public void checksGenerationAgainBeforeTheAtomicMove() throws Exception {
        File partial = directory.newFile("partial");
        File target = new File(directory.getRoot(), "target");
        String hash = FolioleCompanionAttachmentResourceHash.digestHex(partial);
        int[] checks = {0};
        assertThrows(IllegalStateException.class, () ->
            FolioleCompanionAttachmentFileStage.publishReceived(partial, target, hash, 0, () -> {
                if (++checks[0] == 2) throw new IllegalStateException("attachment_owner_closed");
            }));
        assertTrue(partial.isFile());
        assertFalse(target.exists());
    }
}
