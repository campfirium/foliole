package com.foliole.android.framed;

public enum FramedSyncFrameType {
    SESSION_CONTROL(1),
    TRANSFER_HEADER(2),
    FACT(3),
    BLOB_CHUNK(4),
    TRANSFER_TRAILER(5),
    TRANSFER_RECEIPT(6);

    private final int wireValue;

    FramedSyncFrameType(int wireValue) {
        this.wireValue = wireValue;
    }

    public int wireValue() {
        return wireValue;
    }

    static FramedSyncFrameType fromWireValue(int wireValue) throws FramedSyncValidationException {
        for (FramedSyncFrameType value : values()) {
            if (value.wireValue == wireValue) return value;
        }
        throw new FramedSyncValidationException("frame_type_invalid");
    }
}
