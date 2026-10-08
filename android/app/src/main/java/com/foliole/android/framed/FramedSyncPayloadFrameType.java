package com.foliole.android.framed;

final class FramedSyncPayloadFrameType {
    private FramedSyncPayloadFrameType() {}

    static FramedSyncFrameType of(FramedSyncPayload.Case payloadCase) {
        switch (payloadCase) {
            case TRANSFER_HEADER: return FramedSyncFrameType.TRANSFER_HEADER;
            case FACT:
            case FACT_FRAGMENT: return FramedSyncFrameType.FACT;
            case BLOB_CHUNK: return FramedSyncFrameType.BLOB_CHUNK;
            case TRANSFER_TRAILER: return FramedSyncFrameType.TRANSFER_TRAILER;
            case TRANSFER_RECEIPT: return FramedSyncFrameType.TRANSFER_RECEIPT;
            default: return FramedSyncFrameType.SESSION_CONTROL;
        }
    }
}
