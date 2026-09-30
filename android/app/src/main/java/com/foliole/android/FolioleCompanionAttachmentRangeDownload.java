package com.foliole.android;

import android.content.Context;
import org.json.JSONObject;

import java.io.File;
import java.io.RandomAccessFile;

final class FolioleCompanionAttachmentRangeDownload {
    private static final int RANGE_BYTES = 1024 * 1024;
    interface Checkpoint {
        long load(long total) throws Exception;
        void save(long total, long confirmed) throws Exception;
        void clear() throws Exception;
    }
    interface RangeSource { Range read(long offset) throws Exception; }
    static final class Range {
        final byte[] body;
        final long totalBytes;
        Range(byte[] body, long totalBytes) { this.body = body; this.totalBytes = totalBytes; }
    }

    private FolioleCompanionAttachmentRangeDownload() {}

    static void download(Context context, String url, JSONObject headers, File partial,
                         File verified, String contentHash, Checkpoint checkpoint) throws Exception {
        downloadFromRanges(partial, verified, contentHash, offset -> {
            FolioleCompanionDesktopHttpClient.BinaryResponse response = range(context, url, headers, offset);
            return new Range(response.body, response.totalBytes);
        }, checkpoint);
    }

    static void downloadFromRanges(File partial, File verified, String contentHash,
                                   RangeSource source, Checkpoint checkpoint) throws Exception {
        if (verified.isFile() && contentHash.equals(FolioleCompanionAttachmentResourceHash.digestHex(verified))) {
            checkpoint.clear();
            return;
        }
        File parent = partial.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        Range first = source.read(0);
        long total = first.totalBytes;
        if (total < 0 || first.body.length != Math.min(RANGE_BYTES, total)) {
            throw new IllegalStateException("attachment_resource_range_invalid");
        }
        try (RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
            long offset = verifiedPrefix(output, first.body, total, checkpoint.load(total));
            checkpoint.save(total, offset);
            while (offset < total) {
                Range segment = offset == 0 ? first : source.read(offset);
                if (segment.totalBytes != total || segment.body.length != Math.min(RANGE_BYTES, total - offset)) {
                    throw new IllegalStateException("attachment_resource_range_invalid");
                }
                output.seek(offset);
                output.write(segment.body);
                output.getFD().sync();
                checkpoint.save(total, offset + segment.body.length);
                offset += segment.body.length;
            }
        }
        if (!contentHash.equals(FolioleCompanionAttachmentResourceHash.digestHex(partial))) {
            partial.delete();
            checkpoint.clear();
            throw new IllegalStateException("Attachment resource hash mismatch.");
        }
        File verifiedParent = verified.getParentFile();
        if (verifiedParent != null && !verifiedParent.exists() && !verifiedParent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        if (!partial.renameTo(verified)) throw new IllegalStateException("attachment_resource_publish_failed");
        checkpoint.clear();
    }

    private static long verifiedPrefix(RandomAccessFile output, byte[] first, long total, long confirmed) throws Exception {
        long size = output.length();
        long available = Math.min(size, Math.min(total, confirmed));
        long complete = available == total ? total : available / RANGE_BYTES * RANGE_BYTES;
        if (size != complete) {
            output.setLength(complete);
            output.getFD().sync();
        }
        if (complete == 0) return 0;
        byte[] current = new byte[first.length];
        output.seek(0);
        output.readFully(current);
        if (java.util.Arrays.equals(current, first)) return complete;
        output.setLength(0);
        output.getFD().sync();
        return 0;
    }

    private static FolioleCompanionDesktopHttpClient.BinaryResponse range(
        Context context, String url, JSONObject headers, long offset
    ) throws Exception {
        String path = url + (url.contains("?") ? "&" : "?") + "offset=" + offset + "&length=" + RANGE_BYTES;
        return FolioleCompanionDesktopHttpClient.requestBinary(context, path, "GET", headers, null);
    }
}
