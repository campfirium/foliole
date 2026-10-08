package com.foliole.android;

import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncReceiptBody;
import com.foliole.android.framed.FramedSyncTransferSequence;
import com.foliole.android.framed.FramedSyncWireHeader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Dispatch signed original units independently and freeze each receipt before continuing. */
final class FolioleCompanionFramedSyncSequenceRoute {
    interface Handler { FramedSyncReceiptBody consume(FramedSyncTransferSequence.Unit unit) throws Exception; }
    private FolioleCompanionFramedSyncSequenceRoute() {}

    static void respond(File request, File directory, OutputStream output, String device, String epoch,
        FramedSyncPayloadBudget budget, Handler handler) throws Exception {
        File receipts = File.createTempFile("foliole-framed-receipts-", ".body", directory);
        boolean echo = false;
        long messageBytes = 0;
        try {
            try (var sequence = new FramedSyncTransferSequence(request);
                 var file = new FileOutputStream(receipts)) {
                for (var unit = sequence.next(); unit != null; unit = sequence.next()) {
                    try (var consumed = unit; var receipt = handler.consume(unit)) {
                        echo = unit.isReceipt();
                        if (receipt != null) {
                            messageBytes += receipt.length() - FramedSyncWireHeader.BYTES - 16;
                            if (messageBytes > FramedSyncTransferSequence.MAX_MESSAGE_BYTES) {
                                throw new IllegalArgumentException("framed_sync_batch_message_limit_exceeded");
                            }
                            receipt.copyTo(file);
                        } else if (!echo) throw new IllegalStateException("framed_sync_receipt_required");
                    }
                }
                file.getFD().sync();
            }
            FolioleCompanionHttpResponse.framedSequence(output, echo ? request : receipts, device, epoch,
                budget, FramedSyncPayloadBudget.Lane.RECEIPT);
        } finally {
            if (receipts.exists() && !receipts.delete()) throw new java.io.IOException("http_body_cleanup_failed");
        }
    }
}
