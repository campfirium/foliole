package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncSQLiteFactFragmentsTest {
    @Test public void partialReopenCompletesOneFactAndReadyPreservesOriginalFragments() throws Exception {
        var fixture = new FramedSyncSQLiteFactFragmentFixture();
        File file = File.createTempFile("framed-fact-fragments-", ".db",
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        try {
            try (var database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                var staging = new FramedSyncSQLiteStaging(database);
                staging.admitInboundTransfer(fixture.proposal());
                var adapter = new FramedSyncInboundStagingAdapter(staging);
                adapter.commitAuthenticatedFrame(fixture.frame(0, FramedSyncFrameType.TRANSFER_HEADER, fixture.header()));
                for (int index = 0; index < 2; index++) adapter.commitAuthenticatedFrame(
                    fixture.frame(index + 1, FramedSyncFrameType.FACT, fixture.pieces.get(index)));
                assertEquals(0, new FramedSyncSQLiteFacts(database, new FramedSyncSQLiteTransfers(database))
                    .count(FramedSyncSQLiteFixture.TRANSFER_ID, FramedSyncSQLiteFixture.ATTEMPT_A));
            }
            try (var database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                var adapter = new FramedSyncInboundStagingAdapter(new FramedSyncSQLiteStaging(database));
                for (int index = 2; index < fixture.pieces.size(); index++) adapter.commitAuthenticatedFrame(
                    fixture.frame(index + 1, FramedSyncFrameType.FACT, fixture.pieces.get(index)));
                try (var row = database.rawQuery("SELECT first_sequence, last_sequence, length(canonical_bytes) " +
                    "FROM framed_sync_android_facts", null)) {
                    assertTrue(row.moveToFirst()); assertEquals("1", row.getString(0));
                    assertEquals(String.valueOf(fixture.pieces.size()), row.getString(1));
                    assertEquals(0, row.getInt(2));
                }
                adapter.commitAuthenticatedFrame(fixture.frame(fixture.pieces.size() + 1,
                    FramedSyncFrameType.TRANSFER_TRAILER, fixture.trailer()));
                FramedSyncCompletedInboundCleanup.recover(database);
                assertEquals(fixture.fact, new FramedSyncSQLiteFactFragments(database).fact(
                    FramedSyncSQLiteFixture.TRANSFER_ID, FramedSyncSQLiteFixture.ATTEMPT_A, 1, fixture.pieces.size()));
                assertEquals(FramedSyncStageOutcome.IDENTICAL, adapter.commitAuthenticatedFrame(
                    fixture.frame(1, FramedSyncFrameType.FACT, fixture.pieces.get(0))));
                var altered = fixture.pieces.get(0).toBuilder().setFactFragment(fixture.pieces.get(0)
                    .getFactFragment().toBuilder().setOffset(1)).build();
                try {
                    adapter.commitAuthenticatedFrame(fixture.frame(1, FramedSyncFrameType.FACT, altered));
                    fail("accepted changed duplicate fragment");
                } catch (FramedSyncValidationException error) { assertEquals("inbound_frame_identity_conflict", error.code()); }
            }
        } finally { SQLiteDatabase.deleteDatabase(file); }
    }

    @Test public void upgradesOldFactOwnerWithoutChangingSmallFactOrReadyInput() throws Exception {
        try (var database = SQLiteDatabase.create(null)) {
            FramedSyncSQLiteSchema.install(database);
            assertEquals(2, database.getVersion());
            var staging = new FramedSyncSQLiteStaging(database);
            staging.admitInboundTransfer(FramedSyncSQLiteFixture.proposal());
            var adapter = new FramedSyncInboundStagingAdapter(staging);
            adapter.commitAuthenticatedFrame(FramedSyncSQLiteFixture.frame(FramedSyncSQLiteFixture.ATTEMPT_A,
                0, FramedSyncFrameType.TRANSFER_HEADER, FramedSyncSQLiteFixture.header(FramedSyncSQLiteFixture.ATTEMPT_A),
                new byte[] {1}));
            adapter.commitAuthenticatedFrame(FramedSyncSQLiteFixture.frame(FramedSyncSQLiteFixture.ATTEMPT_A,
                1, FramedSyncFrameType.FACT, FramedSyncSQLiteFixture.fact("title"), new byte[] {2}));
            database.execSQL("ALTER TABLE framed_sync_android_facts RENAME TO previous_facts");
            database.execSQL("CREATE TABLE framed_sync_android_facts (transfer_id BLOB NOT NULL, " +
                "attempt_id BLOB NOT NULL, fact_kind INTEGER NOT NULL, object_type TEXT NOT NULL, " +
                "global_id TEXT NOT NULL, fact_id TEXT NOT NULL, canonical_bytes BLOB NOT NULL, " +
                "PRIMARY KEY (transfer_id, attempt_id, fact_kind, object_type, global_id, fact_id), " +
                "FOREIGN KEY (transfer_id, attempt_id) REFERENCES framed_sync_android_attempts" +
                "(transfer_id, attempt_id) ON DELETE CASCADE)");
            database.execSQL("INSERT INTO framed_sync_android_facts SELECT transfer_id, attempt_id, " +
                "fact_kind, object_type, global_id, fact_id, canonical_bytes FROM previous_facts");
            database.execSQL("DROP TABLE previous_facts");
            database.execSQL("UPDATE framed_sync_android_transfers SET state = 'ready_to_apply'");
            database.setVersion(1);
            FramedSyncSQLiteSchema.install(database);
            assertEquals(2, database.getVersion());
            try (var row = database.rawQuery("SELECT canonical_bytes, first_sequence, last_sequence " +
                "FROM framed_sync_android_facts", null)) {
                assertTrue(row.moveToFirst());
                assertArrayEquals(FramedSyncSQLiteFixture.fact("title").getFact().toByteArray(), row.getBlob(0));
                assertTrue(row.isNull(1)); assertTrue(row.isNull(2));
            }
            try (var row = database.rawQuery("SELECT authenticated_plaintext FROM framed_sync_android_frames " +
                "WHERE sequence = '1'", null)) {
                assertTrue(row.moveToFirst()); assertArrayEquals(FramedSyncSQLiteFixture.fact("title").toByteArray(), row.getBlob(0));
            }
            try (var row = database.rawQuery("SELECT state FROM framed_sync_android_transfers", null)) {
                assertTrue(row.moveToFirst()); assertEquals("ready_to_apply", row.getString(0));
            }
        }
    }
}
