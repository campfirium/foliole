package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.Test;

public final class FramedSyncResourceFilesTest {
    @Test
    public void verifiesContentHashAndRoleBeforeChoosingCanonicalKey() throws Exception {
        File root = Files.createTempDirectory("foliole-framed-resource").toFile();
        try {
            File pdf = new File(root, "resource.partial");
            byte[] bytes = "%PDF-1.7\nresource".getBytes();
            Files.write(pdf.toPath(), bytes);
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);

            assertEquals(FramedSyncResourceFiles.hex(hash) + ".pdf",
                FramedSyncResourceFiles.verify(pdf, hash, bytes.length, 3));
            assertNull(FramedSyncResourceFiles.verify(pdf, hash, bytes.length, 2));
            assertNull(FramedSyncResourceFiles.verify(pdf, new byte[32], bytes.length, 3));
        } finally {
            delete(root);
        }
    }

    @Test
    public void recognizesEpubFromItsRequiredMimetypeEntry() throws Exception {
        File root = Files.createTempDirectory("foliole-framed-epub").toFile();
        try {
            File epub = new File(root, "book.partial");
            try (ZipOutputStream output = new ZipOutputStream(new FileOutputStream(epub))) {
                output.putNextEntry(new ZipEntry("mimetype"));
                output.write("application/epub+zip".getBytes());
                output.closeEntry();
            }
            byte[] bytes = Files.readAllBytes(epub.toPath());
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
            assertEquals(FramedSyncResourceFiles.hex(hash) + ".epub",
                FramedSyncResourceFiles.verify(epub, hash, bytes.length, 4));
        } finally {
            delete(root);
        }
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }
}
