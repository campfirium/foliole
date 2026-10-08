package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.net.ServerSocket;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class FramedSyncRawBatchHttpTest {
    @Test public void rawHttpPreservesBothOriginalUnitsAndIndividuallyAuthenticatesReturnedReceipts() throws Exception {
        byte[] first = FramedSyncSequenceFixture.receipt(1);
        byte[] second = FramedSyncSequenceFixture.receipt(2);
        var received = new AtomicReference<byte[]>();
        var failure = new AtomicReference<Throwable>();
        var completed = new ArrayList<Integer>();
        var budget = new FramedSyncPayloadBudget("library", "generation");
        try (ServerSocket server = new ServerSocket(0)) {
            Thread thread = new Thread(() -> FramedSyncHttpTransportTest.serveOne(server,
                received, new AtomicReference<>(), new AtomicReference<>(), failure));
            thread.start();
            FramedSyncHttpTransport.postRawStream(new URL("http://127.0.0.1:" + server.getLocalPort() + "/companion/framed-sync"),
                "group-a", "desktop-b", "epoch-b", FramedSyncHttpTransportTest.memberAuth(),
                output -> { output.write(first); output.write(second); }, input -> {
                    FramedSyncReceiptSequenceReader.read(input, new byte[32], "receiver", "epoch",
                        List.of(expected(1), expected(2)), budget,
                        receipt -> completed.add((int) receipt.getTransferId().byteAt(0)));
                    return null;
                });
            thread.join(2_000);
            if (failure.get() != null) throw new AssertionError(failure.get());
            assertEquals(List.of(1, 2), completed);
            byte[] request = received.get();
            assertEquals(first.length + second.length, request.length);
            assertArrayEquals(first, java.util.Arrays.copyOf(request, first.length));
            assertArrayEquals(second, java.util.Arrays.copyOfRange(request, first.length, request.length));
        } finally { budget.cancel(); budget.drain(); }
    }
    private static FramedSyncReceiptSequenceReader.Expected expected(int id) {
        byte[] identity = new byte[32];
        identity[0] = (byte) id;
        return new FramedSyncReceiptSequenceReader.Expected(identity, identity);
    }
}
