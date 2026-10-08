package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferReceipt;
import com.google.protobuf.ByteString;
import java.io.ByteArrayOutputStream;

public final class FramedSyncSequenceFixture {
    private FramedSyncSequenceFixture() {}
    public static byte[] receipt() throws Exception { return receipt(0); }
    public static byte[] receipt(int id) throws Exception {
        byte[] identity = new byte[32];
        identity[0] = (byte) id;
        var receipt = TransferReceipt.newBuilder().setTransferId(ByteString.copyFrom(identity))
            .setContentId(ByteString.copyFrom(identity)).setAppliedStateHash(ByteString.copyFrom(new byte[32]))
            .setReceiverDeviceId("receiver").setReceiverLibraryEpoch("epoch").build();
        byte[] plaintext = ProtocolMessage.newBuilder().setTransferReceipt(receipt).build().toByteArray();
        var preamble = FramedSyncPreamble.transfer(identity, new byte[16], new byte[4]);
        byte[] header = FramedSyncWireHeader.encode(plaintext.length + 16, 0, 6);
        var output = new ByteArrayOutputStream();
        output.write(preamble.encoded());
        output.write(header);
        output.write(FramedSyncFrameCrypto.encrypt(new byte[32], preamble, header, plaintext, 0));
        return output.toByteArray();
    }
}
