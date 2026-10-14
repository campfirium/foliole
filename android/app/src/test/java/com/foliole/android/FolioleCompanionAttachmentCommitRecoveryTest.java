package com.foliole.android;

import static org.junit.Assert.*;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;

public final class FolioleCompanionAttachmentCommitRecoveryTest {
    @Test public void publicationPreservesExistingFilesAndRejectsCorruptBytes() throws Exception {
        File root = Files.createTempDirectory("foliole-publish-").toFile();
        File source = new File(root, "partial"), target = new File(root, "published");
        byte[] bytes = "verified content".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try {
            Files.write(source.toPath(), bytes);
            String hash = FolioleCompanionAttachmentResourceHash.digestHex(source);
            assertTrue(FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash));
            assertFalse(source.exists());
            Object identity = Files.getAttribute(target.toPath(), "unix:ino");
            Files.write(source.toPath(), bytes);
            assertFalse(FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash));
            assertEquals(identity, Files.getAttribute(target.toPath(), "unix:ino"));
            Files.write(source.toPath(), new byte[] {1});
            assertThrows(Exception.class, () -> FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash));
            assertArrayEquals(bytes, Files.readAllBytes(target.toPath()));
            assertArrayEquals(new byte[] {1}, Files.readAllBytes(source.toPath()));
            Files.write(target.toPath(), new byte[] {2});
            assertThrows(Exception.class, () -> FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash));
            assertArrayEquals(new byte[] {1}, Files.readAllBytes(source.toPath()));
            assertArrayEquals(new byte[] {2}, Files.readAllBytes(target.toPath()));
            assertEquals(identity, Files.getAttribute(target.toPath(), "unix:ino"));
            Files.write(source.toPath(), bytes);
            Object replacementIdentity = Files.getAttribute(source.toPath(), "unix:ino");
            assertTrue(FolioleCompanionAttachmentFileStage.publishVerified(source, target, hash));
            assertFalse(source.exists());
            assertArrayEquals(bytes, Files.readAllBytes(target.toPath()));
            assertEquals(replacementIdentity, Files.getAttribute(target.toPath(), "unix:ino"));
        } finally { source.delete(); target.delete(); root.delete(); }
    }

}
