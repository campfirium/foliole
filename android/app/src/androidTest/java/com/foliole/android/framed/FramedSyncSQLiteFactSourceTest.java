package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.FactIdentity;
import com.foliole.sync.v22.FactKind;
import com.foliole.sync.v22.FactRecord;
import com.google.protobuf.ByteString;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncSQLiteFactSourceTest {
    private static final byte[] TRANSFER = {1}, ATTEMPT = {2};

    @Test public void readsCanonicalOrderAndRejectsOversizedDurableFactBeforeDecoding() throws Exception {
        try (SQLiteDatabase database = SQLiteDatabase.create(null)) {
            FramedSyncSQLiteSchema.install(database);
            database.execSQL("PRAGMA foreign_keys = ON");
            database.execSQL("INSERT INTO framed_sync_android_transfers VALUES (?, ?, 2, 0, 0, " +
                "'sender', 'sender-epoch', 'receiver', 'receiver-epoch', ?, 'receiving')",
                new Object[] {TRANSFER, new byte[32], ATTEMPT});
            database.execSQL("INSERT INTO framed_sync_android_attempts VALUES (?, ?, 'receiving')",
                new Object[] {TRANSFER, ATTEMPT});
            FramedSyncSQLiteFacts source = new FramedSyncSQLiteFacts(database, new FramedSyncSQLiteTransfers(database));
            FactRecord last = fact("version-z"), first = fact("version-a");
            insert(database, last); insert(database, first);
            assertEquals(2, source.count(TRANSFER, ATTEMPT));
            assertArrayEquals(FramedSyncCanonicalManifest.contentId(Arrays.asList(last, first), Collections.emptyList()),
                source.contentId(TRANSFER, ATTEMPT, Collections.emptyList()));
            database.execSQL("UPDATE framed_sync_android_facts SET canonical_bytes = zeroblob(?) WHERE fact_id = ?",
                new Object[] {FramedSyncContract.MAX_FRAME_MESSAGE_BYTES + 1, "version-a"});
            try {
                source.contentId(TRANSFER, ATTEMPT, Collections.emptyList());
                fail("accepted oversized durable fact");
            } catch (FramedSyncValidationException error) {
                assertEquals("canonical_fact_source_changed", error.code());
            }
            database.execSQL("UPDATE framed_sync_android_facts SET canonical_bytes = ? WHERE fact_id = ?",
                new Object[] {first.toByteArray(), "version-a"});
            assertArrayEquals(FramedSyncCanonicalManifest.contentId(Arrays.asList(last, first), Collections.emptyList()),
                source.contentId(TRANSFER, ATTEMPT, Collections.emptyList()));
            assertEquals(2, source.count(TRANSFER, ATTEMPT));
            assertEquals(0, source.count(TRANSFER, new byte[] {9}));
        }
    }

    private static FactRecord fact(String id) {
        return FactRecord.newBuilder().setIdentity(FactIdentity.newBuilder().setKind(FactKind.FACT_KIND_NODE_VERSION)
            .setObjectType("node").setGlobalId("node-1").setFactId(id))
            .setSharedStateHash(ByteString.copyFrom(new byte[32])).setBody(CanonicalObject.getDefaultInstance()).build();
    }

    private static void insert(SQLiteDatabase database, FactRecord fact) {
        ContentValues values = new ContentValues();
        values.put("transfer_id", TRANSFER); values.put("attempt_id", ATTEMPT);
        values.put("fact_kind", fact.getIdentity().getKindValue());
        values.put("object_type", fact.getIdentity().getObjectType());
        values.put("global_id", fact.getIdentity().getGlobalId());
        values.put("fact_id", fact.getIdentity().getFactId());
        values.put("canonical_bytes", fact.toByteArray());
        database.insertOrThrow("framed_sync_android_facts", null, values);
    }
}
