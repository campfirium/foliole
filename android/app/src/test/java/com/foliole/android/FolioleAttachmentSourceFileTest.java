package com.foliole.android;

import static org.junit.Assert.*;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;

public final class FolioleAttachmentSourceFileTest {
    @Test public void acceptsDirectoryAliasesButRejectsLinkedAttachmentFiles() throws Exception {
        File root = Files.createTempDirectory("attachment-alias-").toFile().getCanonicalFile();
        File actual = new File(root, "actual"), alias = new File(root, "alias");
        File file = new File(actual, "content.pdf"), linked = new File(actual, "linked.pdf");
        try {
            Files.createDirectory(actual.toPath());
            Files.write(file.toPath(), new byte[] {1, 2, 3});
            Files.createSymbolicLink(alias.toPath(), actual.toPath());
            assertEquals(file, FolioleAttachmentBlockFiles.checkedSourceFile(new File(alias, "content.pdf")));
            Files.createSymbolicLink(linked.toPath(), file.toPath());
            assertThrows(IllegalArgumentException.class, () ->
                FolioleAttachmentBlockFiles.checkedSourceFile(new File(alias, "linked.pdf")));
        } finally {
            Files.deleteIfExists(linked.toPath()); Files.deleteIfExists(alias.toPath());
            Files.deleteIfExists(file.toPath()); Files.deleteIfExists(actual.toPath()); Files.deleteIfExists(root.toPath());
        }
    }
}
