package com.foliole.android.framed;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.TransferReceipt;
import java.io.File;
import java.io.InputStream;

public final class FramedSyncTransferSQLite implements AutoCloseable {
    private static final String DATABASE_NAME = "foliole-framed-sync-transfer.db";
    private final SQLiteDatabase database;
    private final File file;
    private final FramedSyncSQLiteStaging staging;

    public FramedSyncTransferSQLite(Context context) {
        file = context.getApplicationContext().getDatabasePath(DATABASE_NAME);
        database = SQLiteDatabase.openOrCreateDatabase(file, null);
        staging = new FramedSyncSQLiteStaging(database,
            new File(context.getApplicationContext().getFilesDir(), "attachments"));
    }

    public synchronized FramedSyncTransferReader.Result receive(
        InputStream input,
        byte[] groupKey,
        FramedSyncTransferContext context
    ) throws Exception {
        return FramedSyncTransferReader.receive(input, groupKey, context, staging);
    }

    public synchronized byte[] receipt(byte[] groupKey, TransferReceipt receipt) throws Exception {
        return FramedSyncReceiptWriter.encode(groupKey, receipt, staging);
    }

    public String path() {
        return file.getAbsolutePath();
    }

    public synchronized FramedSyncResourcePublication publishResources(byte[] transferId)
        throws Exception {
        return staging.publishResources(transferId);
    }

    @Override
    public synchronized void close() {
        database.close();
    }
}
