package com.foliole.android.framed;

public final class FramedSyncValidationException extends Exception {
    private final String code;

    FramedSyncValidationException(String code) {
        super(code);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
