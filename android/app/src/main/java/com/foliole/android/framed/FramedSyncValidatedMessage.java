package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;

public final class FramedSyncValidatedMessage {
    private final FramedSyncPayload payload;
    private final ProtocolMessage wireMessage;

    FramedSyncValidatedMessage(FramedSyncPayload payload, ProtocolMessage wireMessage) {
        this.payload = payload;
        this.wireMessage = wireMessage;
    }

    public FramedSyncPayload payload() {
        return payload;
    }

    ProtocolMessage wireMessage() {
        return wireMessage;
    }
}
