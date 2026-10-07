package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.BlobRole;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.google.protobuf.ByteString;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncOutboundFileStagingTest {
    @Test
    public void keepsReplayableCiphertextInAWireFileInsteadOfSQLiteBlobs() throws Exception {
        Context context = androidx.test.platform.app.InstrumentationRegistry
            .getInstrumentation().getTargetContext();
        context.deleteDatabase("foliole-framed-sync-outbound.db");
        File wireDirectory = new File(context.getFilesDir(), "framed-sync/outbound");
        delete(wireDirectory);
        byte[] body = "body".getBytes();
        byte[] resource = new byte[FramedSyncContract.BLOB_CHUNK_BYTES + 9];
        Arrays.fill(resource, (byte) 7);
        byte[] resourceHash = MessageDigest.getInstance("SHA-256").digest(resource);
        File resourceFile = new File(context.getCacheDir(), "framed-outbound-resource.pdf");
        Files.write(resourceFile.toPath(), resource);
        FactRecord fact = fact(body, resourceHash, resource.length);
        FramedSyncTransferWriter.Attempt attempt;
        try (FramedSyncOutboundSQLite staging = new FramedSyncOutboundSQLite(context)) {
            attempt = FramedSyncTransferWriter.prepare(new byte[32], new FramedSyncTransferContext(
                "group", "sender", "sender-epoch", "receiver", "receiver-epoch"),
                Collections.singletonList(fact), Arrays.asList(
                    new FramedSyncBlobContent(fact.getBlobs(0).getSha256().toByteArray(), body),
                    FramedSyncBlobContent.file(resourceHash, resourceFile)), staging);
            assertNotNull(staging.loadLatestReplayableAttempt(attempt.transferId()));
        }
        File databaseFile = context.getDatabasePath("foliole-framed-sync-outbound.db");
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
            databaseFile.getPath(), null, SQLiteDatabase.OPEN_READONLY)) {
            assertEquals(32, scalar(database,
                "SELECT MAX(length(ciphertext_sha256)) FROM framed_sync_android_outbound_file_frames"));
            assertEquals(32, scalar(database,
                "SELECT MAX(length(plaintext_sha256)) FROM framed_sync_android_outbound_file_frames"));
        } finally {
            resourceFile.delete();
        }
        File[] wires = wireDirectory.listFiles((directory, name) -> name.endsWith(".wire"));
        assertNotNull(wires);
        assertEquals(1, wires.length);
        assertTrue(wires[0].length() > resource.length);
        try (FramedSyncOutboundSQLite staging = new FramedSyncOutboundSQLite(context)) {
            staging.discardInterruptedAttempts();
            assertNull(staging.loadLatestReplayableAttempt(attempt.transferId()));
        }
        assertEquals(0, wireDirectory.listFiles((directory, name) -> name.endsWith(".wire")).length);
        context.deleteDatabase("foliole-framed-sync-outbound.db");
        delete(wireDirectory);
    }

    private static FactRecord fact(byte[] body, byte[] resourceHash, int resourceLength)
        throws Exception {
        BlobReference bodyBlob = BlobReference.newBuilder()
            .setSha256(ByteString.copyFrom(MessageDigest.getInstance("SHA-256").digest(body)))
            .setByteLength(body.length).setRole(BlobRole.BLOB_ROLE_NODE_BODY).setRequired(true).build();
        BlobReference resourceBlob = BlobReference.newBuilder().setSha256(ByteString.copyFrom(resourceHash))
            .setByteLength(resourceLength).setRole(BlobRole.BLOB_ROLE_PDF).setRequired(true).build();
        return FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder()
            .setKind(FactKind.FACT_KIND_NODE_VERSION).setObjectType("node")
            .setGlobalId("node-1").setFactId("version-1"))
            .setSharedStateHash(ByteString.copyFrom(new byte[32]))
            .setBody(CanonicalObject.getDefaultInstance()).addBlobs(bodyBlob).addBlobs(resourceBlob).build();
    }

    private static int scalar(SQLiteDatabase database, String sql) {
        try (Cursor row = database.rawQuery(sql, null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static void delete(File file) {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }
}
