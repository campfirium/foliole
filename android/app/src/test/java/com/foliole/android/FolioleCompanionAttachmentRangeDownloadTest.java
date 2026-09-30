package com.foliole.android;

import static org.junit.Assert.*;

import org.junit.Test;

import java.io.File;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

public final class FolioleCompanionAttachmentRangeDownloadTest {
    private static final int RANGE_BYTES = 1024 * 1024;

    @Test public void identifiesLocalStorageExhaustion() {
        assertEquals("disk_full", FolioleCompanionResourceFailure.classify(
            new java.io.IOException("No space left on device")));
    }

    @Test public void resumesOnlyConfirmedRangesAfterNetworkFailure() throws Exception {
        File root = Files.createTempDirectory("foliole-range-test-").toFile();
        try {
            File partial = new File(root, "attachment.unverified");
            File verified = new File(new File(root, "batch"), "attachment");
            byte[] source = new byte[RANGE_BYTES * 3 + 17];
            for (int index = 0; index < source.length; index++) source[index] = (byte) (index / RANGE_BYTES + 1);
            File sourceFile = new File(root, "source");
            Files.write(sourceFile.toPath(), source);
            String hash = FolioleCompanionAttachmentResourceHash.digestHex(sourceFile);
            MemoryCheckpoint checkpoint = new MemoryCheckpoint();
            AtomicBoolean interrupted = new AtomicBoolean();
            List<Long> offsets = new ArrayList<>();
            FolioleCompanionAttachmentRangeDownload.RangeSource ranges = offset -> {
                offsets.add(offset);
                if (offset == RANGE_BYTES * 2L && interrupted.compareAndSet(false, true)) {
                    throw new IllegalStateException("network disconnected");
                }
                return new FolioleCompanionAttachmentRangeDownload.Range(
                    Arrays.copyOfRange(source, (int) offset, (int) Math.min(source.length, offset + RANGE_BYTES)),
                    source.length);
            };
            assertThrows(IllegalStateException.class, () ->
                FolioleCompanionAttachmentRangeDownload.downloadFromRanges(partial, verified, hash, ranges, checkpoint));
            assertEquals(RANGE_BYTES * 2L, partial.length());
            assertFalse(verified.exists());
            offsets.clear();
            FolioleCompanionAttachmentRangeDownload.downloadFromRanges(partial, verified, hash, ranges, checkpoint);
            assertEquals(Arrays.asList(0L, RANGE_BYTES * 2L, RANGE_BYTES * 3L), offsets);
            assertArrayEquals(source, Files.readAllBytes(verified.toPath()));
            assertFalse(partial.exists());
        } finally {
            removeTree(root);
        }
    }

    @Test public void downloadsThreeHundredMebibytesWithinSmallJavaHeap() throws Exception {
        File root = Files.createTempDirectory("foliole-range-scale-").toFile();
        try {
            long total = 300L * RANGE_BYTES;
            File source = new File(root, "source");
            try (RandomAccessFile file = new RandomAccessFile(source, "rw")) { file.setLength(total); }
            String hash = FolioleCompanionAttachmentResourceHash.digestHex(source);
            File verified = new File(new File(root, "batch"), "attachment");
            int[] requests = { 0 };
            FolioleCompanionAttachmentRangeDownload.downloadFromRanges(
                new File(root, "attachment.unverified"), verified, hash, offset -> {
                    requests[0]++;
                    byte[] segment = new byte[RANGE_BYTES];
                    try (RandomAccessFile file = new RandomAccessFile(source, "r")) {
                        file.seek(offset);
                        file.readFully(segment);
                    }
                    return new FolioleCompanionAttachmentRangeDownload.Range(segment, total);
                }, new MemoryCheckpoint());
            assertEquals(300, requests[0]);
            assertEquals(total, verified.length());
            assertEquals(hash, FolioleCompanionAttachmentResourceHash.digestHex(verified));
        } finally { removeTree(root); }
    }


    @Test public void discardsAlignedUnconfirmedTailAndRetreatsFromShortFile() throws Exception {
        for (boolean shortFile : new boolean[] { false, true }) {
            File root = Files.createTempDirectory("foliole-checkpoint-test-").toFile();
            try {
                byte[] bytes = new byte[3 * RANGE_BYTES + 17];
                Arrays.fill(bytes, (byte) 0x42);
                File source = new File(root, "source");
                Files.write(source.toPath(), bytes);
                File partial = new File(root, "attachment.unverified");
                Files.write(partial.toPath(), Arrays.copyOf(bytes, shortFile ? RANGE_BYTES : 3 * RANGE_BYTES));
                if (!shortFile) {
                    try (RandomAccessFile file = new RandomAccessFile(partial, "rw")) {
                        file.seek(2 * RANGE_BYTES);
                        file.write(new byte[RANGE_BYTES]);
                    }
                }
                MemoryCheckpoint checkpoint = new MemoryCheckpoint();
                checkpoint.save(bytes.length, 2 * RANGE_BYTES);
                List<Long> offsets = new ArrayList<>();
                File verified = new File(root, "verified");
                FolioleCompanionAttachmentRangeDownload.downloadFromRanges(partial, verified,
                    FolioleCompanionAttachmentResourceHash.digestHex(source), offset -> {
                        offsets.add(offset);
                        return new FolioleCompanionAttachmentRangeDownload.Range(Arrays.copyOfRange(bytes,
                            (int) offset, (int) Math.min(bytes.length, offset + RANGE_BYTES)), bytes.length);
                    }, checkpoint);
                assertEquals(shortFile ? RANGE_BYTES : 2L * RANGE_BYTES, offsets.get(1).longValue());
                assertArrayEquals(bytes, Files.readAllBytes(verified.toPath()));
                assertEquals(0, checkpoint.confirmed);
            } finally { removeTree(root); }
        }
    }

    private static final class MemoryCheckpoint implements FolioleCompanionAttachmentRangeDownload.Checkpoint {
        long total;
        long confirmed;
        public long load(long expected) { return total == expected ? confirmed : 0; }
        public void save(long expected, long offset) { total = expected; confirmed = offset; }
        public void clear() { confirmed = 0; }
    }

    private static void removeTree(File root) throws Exception {
        try (var entries = Files.walk(root.toPath())) {
            for (var entry : entries.sorted(Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new)) {
                Files.delete(entry);
            }
        }
    }
}
