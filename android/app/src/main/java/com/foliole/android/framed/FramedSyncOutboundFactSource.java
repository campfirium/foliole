package com.foliole.android.framed;

import com.foliole.sync.v22.TransferHeader;

/** Each callback consumes one borrowed message before read returns. */
public interface FramedSyncOutboundFactSource {
    TransferHeader header();

    default FramedSyncPayloadBudget budget() { return null; }

    void read(int factIndex, int fragmentIndex, Consumer consumer) throws Exception;

    interface Consumer {
        void accept(byte[] messageBytes, boolean lastFragment) throws Exception;
    }
}
