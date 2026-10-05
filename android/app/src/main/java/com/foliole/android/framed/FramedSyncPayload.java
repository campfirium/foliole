package com.foliole.android.framed;

import com.google.protobuf.MessageLite;

public final class FramedSyncPayload {
    public enum Case {
        HANDSHAKE,
        HANDSHAKE_ACCEPTANCE,
        INVENTORY_BEGIN,
        INVENTORY_CHUNK,
        INVENTORY_END,
        DIFFERENCE_REQUEST,
        TRANSFER_PROPOSAL,
        BLOB_OFFER,
        MISSING_BLOB_SET,
        TRANSFER_HEADER,
        FACT,
        BLOB_CHUNK,
        TRANSFER_TRAILER,
        TRANSFER_RECEIPT,
        ROUND_RECEIPT,
        TRANSFER_TERMINATION,
        ERROR
    }

    private final Case payloadCase;
    private final MessageLite value;

    FramedSyncPayload(Case payloadCase, MessageLite value) {
        this.payloadCase = payloadCase;
        this.value = value;
    }

    public Case payloadCase() {
        return payloadCase;
    }

    public MessageLite value() {
        return value;
    }
}
