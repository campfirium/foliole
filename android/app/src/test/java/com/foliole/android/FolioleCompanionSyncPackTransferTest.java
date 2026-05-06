package com.foliole.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class FolioleCompanionSyncPackTransferTest {
    @Test
    public void storeDownloadedPackExtractsIncomingDatabaseFromSyncPack() throws Exception {
        File tempRoot = Files.createTempDirectory("foliole-sync-pack-transfer").toFile();
        byte[] sqliteBytes = sqliteBytes();

        File storedPack = FolioleCompanionSyncPackTransfer.storeDownloadedPack(tempRoot, syncPack(sqliteBytes));

        assertTrue(storedPack.getName().endsWith(".db"));
        assertArrayEquals(sqliteBytes, Files.readAllBytes(storedPack.toPath()));
        deleteRecursively(tempRoot);
    }

    @Test
    public void storeDownloadedPackRejectsNonContainerBytesBeforeAttach() throws Exception {
        File tempRoot = Files.createTempDirectory("foliole-sync-pack-transfer-invalid").toFile();
        try {
            FolioleCompanionSyncPackTransfer.storeDownloadedPack(tempRoot, "not a sqlite database".getBytes(StandardCharsets.UTF_8));
            fail("Expected invalid sync pack container to be rejected.");
        } catch (IllegalArgumentException exception) {
            assertTrue(exception.getMessage().contains("Invalid sync pack container"));
        } finally {
            deleteRecursively(tempRoot);
        }
    }

    private static byte[] syncPack(byte[] sqliteBytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("manifest.json"));
            zip.write(("{\"format\":\"foliole.sync-pack\",\"database_file\":\"incoming.db.deflate\"}")
                .getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("incoming.db.deflate"));
            zip.write(deflate(sqliteBytes));
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private static byte[] deflate(byte[] bytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (DeflaterOutputStream deflater = new DeflaterOutputStream(output)) {
            deflater.write(bytes);
        }
        return output.toByteArray();
    }

    private static byte[] sqliteBytes() {
        byte[] bytes = new byte[128];
        byte[] header = "SQLite format 3\0".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(header, 0, bytes, 0, header.length);
        return bytes;
    }

    private static void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }
}
