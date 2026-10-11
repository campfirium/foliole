package com.foliole.android.framed;

import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.TransferHeader;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONObject;

final class FramedSyncFileBlobs {
    private final FramedSyncFiles files;
    private final File resources;

    FramedSyncFileBlobs(FramedSyncFiles files, File resources) { this.files = files; this.resources = resources; }

    void stage(byte[] transfer, byte[] attempt, TransferHeader header, BlobChunk chunk) throws Exception {
        BlobReference blob = offer(header, chunk.getBlobHash().toByteArray());
        byte[] data = chunk.getData().toByteArray();
        if (FramedSyncBodyRoles.isBody(blob.getRoleValue())) {
            if (chunk.getOffset() != 0 || data.length != blob.getByteLength() || data.length > FramedSyncContract.MAX_BODY_BYTES) {
                throw invalid("blob_chunk_range_invalid");
            }
            validateBody(blob, data);
            String hash = FramedSyncResourceFiles.hex(blob.getSha256().toByteArray());
            files.write(FramedSyncFileRecords.attempt(transfer, attempt) + "/bodies/" + hash + ".body", data);
        } else {
            stageResource(transfer, attempt, blob, chunk, data);
        }
    }

    void promote(byte[] transfer, byte[] attempt, TransferHeader header) throws Exception {
        for (var blob : header.getManifest().getBlobsList()) {
            String hash = FramedSyncResourceFiles.hex(blob.getSha256().toByteArray());
            JSONObject pin = FramedSyncFileRecords.blob(blob);
            if (FramedSyncBodyRoles.isBody(blob.getRoleValue())) {
                byte[] data = files.read(FramedSyncFileRecords.attempt(transfer, attempt) + "/bodies/" + hash + ".body");
                if (data == null && blob.getByteLength() == 0) {
                    data = new byte[0];
                    validateBody(blob, data);
                    files.write(FramedSyncFileRecords.attempt(transfer, attempt) + "/bodies/" + hash + ".body", data);
                }
                if (data == null) {
                    if (blob.getRequired()) throw invalid("required_blobs_unavailable");
                    continue;
                }
                validateBody(blob, data);
            } else {
                String key = verifyResource(transfer, attempt, blob);
                if (key == null) {
                    if (blob.getRequired()) throw invalid("required_blobs_unavailable");
                    continue;
                }
                pin.put("storageKey", key);
            }
            FramedSyncFileRecords.write(files, FramedSyncFileRecords.attempt(transfer, attempt) + "/pins/" + hash + ".json", pin);
        }
    }

    private void stageResource(byte[] transfer, byte[] attempt, BlobReference blob, BlobChunk chunk, byte[] data) throws Exception {
        long offset = chunk.getOffset();
        if (offset < 0 || offset >= blob.getByteLength() || offset % FramedSyncContract.BLOB_CHUNK_BYTES != 0 ||
            data.length != Math.min(FramedSyncContract.BLOB_CHUNK_BYTES, blob.getByteLength() - offset)) {
            throw invalid("blob_chunk_range_invalid");
        }
        String hash = FramedSyncResourceFiles.hex(blob.getSha256().toByteArray());
        String key = FramedSyncFileRecords.attempt(transfer, attempt) + "/resource-chunks/" + hash + "/" + offset + ".json";
        JSONObject prior = FramedSyncFileRecords.read(files, key);
        byte[] digest = FramedSyncFileFrames.hash(data);
        if (prior != null && (prior.getInt("byteLength") != data.length ||
            !Arrays.equals(FramedSyncFileRecords.bytes(prior.getJSONArray("sha256")), digest))) {
            throw invalid("blob_chunk_identity_conflict");
        }
        if (!resources.isDirectory() && !resources.mkdirs()) throw invalid("resource_storage_unavailable");
        File partial = FramedSyncResourceFiles.partial(resources, transfer, attempt, blob.getSha256().toByteArray());
        try (RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
            output.seek(offset);
            output.write(data);
            output.getFD().sync();
        }
        FramedSyncFiles.syncDirectory(resources);
        FramedSyncFileRecords.write(files, key, new JSONObject().put("offset", Long.toString(offset))
            .put("byteLength", Integer.toString(data.length)).put("sha256", FramedSyncFileRecords.bytes(digest)));
    }

    private String verifyResource(byte[] transfer, byte[] attempt, BlobReference blob) throws Exception {
        String hash = FramedSyncResourceFiles.hex(blob.getSha256().toByteArray());
        for (long offset = 0; offset < blob.getByteLength(); offset += FramedSyncContract.BLOB_CHUNK_BYTES) {
            String key = FramedSyncFileRecords.attempt(transfer, attempt) + "/resource-chunks/" + hash + "/" + offset + ".json";
            JSONObject chunk = FramedSyncFileRecords.read(files, key);
            if (chunk == null || chunk.getInt("byteLength") != Math.min(FramedSyncContract.BLOB_CHUNK_BYTES, blob.getByteLength() - offset)) return null;
        }
        return FramedSyncResourceFiles.verify(FramedSyncResourceFiles.partial(resources, transfer, attempt,
            blob.getSha256().toByteArray()), blob.getSha256().toByteArray(), blob.getByteLength(), blob.getRoleValue());
    }

    private static BlobReference offer(TransferHeader header, byte[] hash) throws Exception {
        for (var blob : header.getManifest().getBlobsList()) if (Arrays.equals(blob.getSha256().toByteArray(), hash)) return blob;
        throw invalid("blob_chunk_not_admitted");
    }

    void discardResources(byte[] transfer, byte[] attempt, TransferHeader header) throws Exception {
        for (var blob : header.getManifest().getBlobsList()) {
            if (!FramedSyncBodyRoles.isBody(blob.getRoleValue())) {
                java.nio.file.Files.deleteIfExists(FramedSyncResourceFiles.partial(resources, transfer, attempt,
                    blob.getSha256().toByteArray()).toPath());
            }
        }
    }

    private static void validateBody(BlobReference blob, byte[] data) throws Exception {
        if (data.length != blob.getByteLength() || data.length > FramedSyncContract.MAX_BODY_BYTES ||
            !Arrays.equals(blob.getSha256().toByteArray(), FramedSyncFileFrames.hash(data))) throw invalid("blob_hash_mismatch");
        StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(data));
    }

    private static FramedSyncValidationException invalid(String code) { return new FramedSyncValidationException(code); }
}
