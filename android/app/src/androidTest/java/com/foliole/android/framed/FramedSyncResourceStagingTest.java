package com.foliole.android.framed;

import static com.foliole.android.framed.FramedSyncSQLiteFixture.*;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferManifest;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferTrailer;
import com.google.protobuf.ByteString;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncResourceStagingTest {
    private static final byte[] RESOURCE = "%PDF-1.7\nresource".getBytes(StandardCharsets.UTF_8);
    private static final byte[] RESOURCE_HASH = sha256(RESOURCE);

    @Test
    public void streamsVerifiesPublishesAndRollsBackAResourceFile() throws Exception {
        File root = new File(androidx.test.platform.app.InstrumentationRegistry
            .getInstrumentation().getTargetContext().getCacheDir(), "framed-resource-test");
        delete(root);
        File attachments = new File(root, "attachments");
        root.mkdirs();
        File databaseFile = new File(root, "staging.db");
        try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(databaseFile, null)) {
            FramedSyncSQLiteStaging staging = new FramedSyncSQLiteStaging(database, attachments);
            FramedSyncInboundStagingAdapter adapter = new FramedSyncInboundStagingAdapter(staging);
            staging.admitInboundTransfer(proposalWithResource());
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 0, FramedSyncFrameType.TRANSFER_HEADER,
                headerWithResource(), new byte[] {1}));
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 1, FramedSyncFrameType.FACT,
                factWithResource(), new byte[] {2}));
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 2, FramedSyncFrameType.BLOB_CHUNK,
                chunk(), new byte[] {3}));
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 3, FramedSyncFrameType.BLOB_CHUNK,
                resourceChunk(), new byte[] {4}));
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 4, FramedSyncFrameType.TRANSFER_TRAILER,
                trailerWithResource(), new byte[] {5}));
            assertEquals(1, count(database, "framed_sync_android_available_resources"));
            assertEquals(32, scalarInt(database,
                "SELECT length(authenticated_plaintext) FROM framed_sync_android_frames " +
                "WHERE sequence = '3'"));
            assertEquals(32, scalarInt(database,
                "SELECT length(ciphertext) FROM framed_sync_android_frames WHERE sequence = '3'"));
            String key = FramedSyncResourceFiles.hex(RESOURCE_HASH) + ".pdf";
            File target = new File(attachments, key);
            File partial = FramedSyncResourceFiles.partial(
                attachments, TRANSFER_ID, ATTEMPT_B, RESOURCE_HASH);
            assertTrue(partial.isFile());
            try (FramedSyncResourcePublication publication = staging.publishResources(TRANSFER_ID)) {
                assertEquals(List.of(key), publication.storageKeys());
                assertTrue(target.isFile());
            }
            assertFalse(target.exists());
            assertTrue(partial.isFile());
            try (FramedSyncResourcePublication publication = staging.publishResources(TRANSFER_ID)) {
                publication.commit();
            }
            assertTrue(target.isFile());
            assertFalse(partial.exists());
        } finally {
            delete(root);
        }
    }

    private static TransferProposal proposalWithResource() throws Exception {
        return proposal().toBuilder().setContentId(data(contentId())).setBlobCount(2)
            .setTotalBlobBytes(BLOB.length + RESOURCE.length).build();
    }

    private static ProtocolMessage headerWithResource() throws Exception {
        FactRecord fact = factWithResource().getFact();
        FactDescriptor descriptor = FactDescriptor.newBuilder().setIdentity(fact.getIdentity())
            .setSharedStateHash(fact.getSharedStateHash()).addRequiredBlobHashes(data(BLOB_HASH))
            .addRequiredBlobHashes(data(RESOURCE_HASH)).build();
        TransferManifest manifest = TransferManifest.newBuilder()
            .setProtocolVersion(FramedSyncContract.PROTOCOL_VERSION).setGroupId("group-a")
            .setContentId(data(contentId())).addFacts(descriptor).addBlobs(bodyBlob())
            .addBlobs(resourceBlob()).build();
        return ProtocolMessage.newBuilder().setTransferHeader(TransferHeader.newBuilder()
            .setTransferId(data(TRANSFER_ID)).setAttemptId(data(ATTEMPT_B)).setManifest(manifest)).build();
    }

    private static ProtocolMessage factWithResource() {
        return ProtocolMessage.newBuilder().setFact(
            fact("original").getFact().toBuilder().addBlobs(resourceBlob())).build();
    }

    private static ProtocolMessage resourceChunk() {
        return ProtocolMessage.newBuilder().setBlobChunk(BlobChunk.newBuilder()
            .setTransferId(data(TRANSFER_ID)).setBlobHash(data(RESOURCE_HASH))
            .setOffset(0).setData(data(RESOURCE))).build();
    }

    private static ProtocolMessage trailerWithResource() throws Exception {
        return ProtocolMessage.newBuilder().setTransferTrailer(TransferTrailer.newBuilder()
            .setTransferId(data(TRANSFER_ID)).setManifestHash(data(contentId()))
            .setFactCount(1).setBlobCount(2)).build();
    }

    private static BlobReference bodyBlob() {
        return BlobReference.newBuilder().setSha256(data(BLOB_HASH)).setByteLength(BLOB.length)
            .setRoleValue(1).setRequired(true).build();
    }

    private static BlobReference resourceBlob() {
        return BlobReference.newBuilder().setSha256(data(RESOURCE_HASH)).setByteLength(RESOURCE.length)
            .setRoleValue(3).setRequired(true).build();
    }

    private static byte[] contentId() throws Exception {
        return FramedSyncCanonicalManifest.contentId(
            List.of(factWithResource().getFact()), List.of(bodyBlob(), resourceBlob()));
    }

    private static int count(SQLiteDatabase database, String table) {
        try (Cursor row = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static int scalarInt(SQLiteDatabase database, String sql) {
        try (Cursor row = database.rawQuery(sql, null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static ByteString data(byte[] value) {
        return ByteString.copyFrom(value);
    }

    private static byte[] sha256(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }

    private static void delete(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }
}
