package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferReceipt;
import com.google.protobuf.ByteString;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import org.junit.Test;

public final class FramedSyncReceiptReaderTest {
    @Test public void acceptsOnlyTheBoundReceiverReceipt() throws Exception {
        byte[] groupKey = new byte[32];
        byte[] transferId = filled(32, 1);
        byte[] contentId = filled(32, 2);
        TransferReceipt receipt = TransferReceipt.newBuilder()
            .setTransferId(ByteString.copyFrom(transferId)).setContentId(ByteString.copyFrom(contentId))
            .setReceiverDeviceId("receiver").setReceiverLibraryEpoch("epoch")
            .setAppliedStateHash(ByteString.copyFrom(filled(32, 3))).build();
        byte[] response = response(groupKey, transferId, receipt);

        TransferReceipt decoded = FramedSyncReceiptReader.read(new ByteArrayInputStream(response),
            groupKey, transferId, contentId, "receiver", "epoch");
        assertArrayEquals(receipt.toByteArray(), decoded.toByteArray());
    }

    @Test public void rejectsAReceiptForAnotherReceiver() throws Exception {
        byte[] groupKey = new byte[32];
        byte[] transferId = filled(32, 1);
        byte[] contentId = filled(32, 2);
        TransferReceipt receipt = TransferReceipt.newBuilder()
            .setTransferId(ByteString.copyFrom(transferId)).setContentId(ByteString.copyFrom(contentId))
            .setReceiverDeviceId("other").setReceiverLibraryEpoch("epoch")
            .setAppliedStateHash(ByteString.copyFrom(filled(32, 3))).build();
        try {
            FramedSyncReceiptReader.read(new ByteArrayInputStream(response(groupKey, transferId, receipt)),
                groupKey, transferId, contentId, "receiver", "epoch");
            fail("expected receiver mismatch");
        } catch (FramedSyncValidationException expected) {
            assertEquals("framed_sync_receipt_identity_mismatch", expected.code());
        }
    }

    @Test public void productionReceiptDecryptsWhileBothPayloadDirectionsAreOccupied() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        byte[] transfer = filled(32, 1);
        byte[] content = filled(32, 2);
        var receipt = TransferReceipt.newBuilder().setTransferId(ByteString.copyFrom(transfer))
            .setContentId(ByteString.copyFrom(content)).setReceiverDeviceId("receiver")
            .setReceiverLibraryEpoch("epoch").setAppliedStateHash(ByteString.copyFrom(filled(32, 3))).build();
        try (var outgoing = owner.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD);
             var incoming = owner.acquire(FramedSyncPayloadBudget.Direction.INBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
            assertEquals(receipt, FramedSyncReceiptReader.read(new ByteArrayInputStream(response(new byte[32], transfer, receipt)),
                new byte[32], transfer, content, "receiver", "epoch", owner));
        } finally { owner.cancel(); owner.drain(); }
    }

    private static byte[] response(byte[] key, byte[] transferId, TransferReceipt receipt) throws Exception {
        FramedSyncPreamble preamble = FramedSyncPreamble.transfer(transferId, filled(16, 4), filled(4, 5));
        ProtocolMessage message = ProtocolMessage.newBuilder().setTransferReceipt(receipt).build();
        byte[] plaintext = message.toByteArray();
        byte[] header = FramedSyncWireHeader.encode(plaintext.length + 16, 0, 6);
        byte[] ciphertext = FramedSyncFrameCrypto.encrypt(key, preamble, header, plaintext, 0);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(preamble.encoded()); output.write(header); output.write(ciphertext);
        return output.toByteArray();
    }

    private static byte[] filled(int length, int value) {
        byte[] result = new byte[length];
        java.util.Arrays.fill(result, (byte) value);
        return result;
    }
}
