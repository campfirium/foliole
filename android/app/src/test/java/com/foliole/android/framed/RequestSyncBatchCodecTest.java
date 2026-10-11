package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.RequestObjectResult;
import com.foliole.sync.v22.RequestBatchEnd;
import com.google.protobuf.ByteString;
import org.junit.Test;

public class RequestSyncBatchCodecTest {
    @Test
    public void objectResultsRoundTripAsControlAndRejectInvalidIdentity() throws Exception {
        var result = RequestObjectResult.newBuilder().setRequestId(ByteString.copyFrom(new byte[16]))
            .setObjectType("node").setGlobalId("node-1");
        for (String error : new String[] {"", "node_version_missing_parents:parent"}) {
            var message = ProtocolMessage.newBuilder().setRequestObjectResult(result.setError(error)).build();
            var validated = FramedSyncCodec.validateOutbound(message, 1);
            byte[] encoded = FramedSyncCodec.encode(validated);
            var decoded = FramedSyncCodec.decode(encoded, 1);
            assertEquals(FramedSyncPayload.Case.REQUEST_OBJECT_RESULT, decoded.payload().payloadCase());
            assertArrayEquals(encoded, FramedSyncCodec.encode(decoded));
            assertThrows(FramedSyncValidationException.class, () -> FramedSyncCodec.decode(encoded, 3));
            var invalid = message.toBuilder().setRequestObjectResult(message.getRequestObjectResult().toBuilder()
                .setRequestId(ByteString.copyFrom(new byte[15]))).build();
            assertThrows(FramedSyncValidationException.class, () -> FramedSyncCodec.validateOutbound(invalid, 1));
        }
        var oversized = ProtocolMessage.newBuilder().setRequestObjectResult(result.setError("x".repeat(65_537))).build();
        assertThrows(FramedSyncValidationException.class, () -> FramedSyncCodec.validateOutbound(oversized, 1));
        var missing = ProtocolMessage.newBuilder().setRequestObjectResult(result.setError("").setGlobalId("")).build();
        assertThrows(FramedSyncValidationException.class, () -> FramedSyncCodec.validateOutbound(missing, 1));
    }

    @Test
    public void batchEndRoundTripsUnsignedCountAndRequiresRequestIdentity() throws Exception {
        for (int count : new int[] {0, 128, -1}) {
            var end = RequestBatchEnd.newBuilder().setRequestId(ByteString.copyFrom(new byte[16])).setObjectCount(count);
            var message = ProtocolMessage.newBuilder().setRequestBatchEnd(end).build();
            byte[] encoded = FramedSyncCodec.encode(FramedSyncCodec.validateOutbound(message, 1));
            var decoded = FramedSyncCodec.decode(encoded, 1);
            assertEquals(FramedSyncPayload.Case.REQUEST_BATCH_END, decoded.payload().payloadCase());
            assertArrayEquals(encoded, FramedSyncCodec.encode(decoded));
            assertThrows(FramedSyncValidationException.class, () -> FramedSyncCodec.decode(encoded, 3));
            var invalid = ProtocolMessage.newBuilder().setRequestBatchEnd(end.setRequestId(ByteString.EMPTY)).build();
            assertThrows(FramedSyncValidationException.class, () -> FramedSyncCodec.validateOutbound(invalid, 1));
        }
    }
}
