package com.foliole.android.framed;

import android.content.Context;
import com.foliole.sync.v22.TransferReceipt;
import java.io.File;
import java.io.InputStream;

/** Uses the existing reader and receipt writer with library-owned file staging. */
public final class FramedSyncTransferFiles implements AutoCloseable {
    private final Context host;

    public FramedSyncTransferFiles(Context host) { this.host = host.getApplicationContext(); }

    private FramedSyncFiles files(FramedSyncPayloadBudget owner) throws Exception {
        if (FramedSyncPayloadBudgetRegistry.current() != owner || owner.isClosed()) {
            throw new IllegalStateException("framed_sync_file_owner_mismatch");
        }
        return new FramedSyncFiles(host, owner.libraryKey());
    }

    private File resources() { return new File(host.getFilesDir(), "attachments"); }

    public FramedSyncTransferReader.Result receive(InputStream input, byte[] groupKey,
        FramedSyncTransferContext context, FramedSyncPayloadBudget budget) throws Exception {
        return receive(input, groupKey, context, budget, header -> {});
    }

    public FramedSyncTransferReader.Result receive(InputStream input, byte[] groupKey,
        FramedSyncTransferContext context, FramedSyncPayloadBudget budget,
        FramedSyncTransferReader.HeaderGuard guard) throws Exception {
        synchronized (budget) {
            var staging = new FramedSyncFileStaging(files(budget), resources(), context);
            try { return FramedSyncTransferReader.receive(input, groupKey, context, staging, budget, guard); }
            finally { staging.releaseRetainedRetry(); }
        }
    }

    public FramedSyncReceiptBody receiptBody(byte[] groupKey, TransferReceipt receipt,
        FramedSyncPayloadBudget budget) throws Exception {
        var staging = new FramedSyncFileStaging(files(budget), resources(), null);
        return FramedSyncReceiptBody.create(budget, () -> FramedSyncReceiptWriter.encode(groupKey, receipt, staging));
    }

    public String path() { return "files"; }

    public FramedSyncResourcePublication publishResources(byte[] transferId, FramedSyncPayloadBudget budget) throws Exception {
        return new FramedSyncResourcePublication(files(budget), resources(), transferId);
    }

    @Override public void close() {}
}
